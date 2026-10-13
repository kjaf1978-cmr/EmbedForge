use ef_release::kit::*;
use std::fs;
use std::path::Path;

fn kit_medium(root: &Path) -> KitMedium {
    let dir = root.join("ubuntu-x86_64");
    let st = dir.join("staging");
    fs::create_dir_all(st.join("embedforge-app/bin")).unwrap();
    fs::create_dir_all(st.join("files")).unwrap();
    // staged on Linux, carried through a zip: no exec bit, but listed in .ef-exec
    fs::write(st.join("embedforge-app/bin/embedforge"), "app").unwrap();
    fs::write(st.join("embedforge-app/README.txt"), "readme").unwrap();
    fs::write(st.join("embedforge-app/.ef-exec"), "bin/embedforge\n").unwrap();
    fs::write(st.join("files/install.sh"), "#!/bin/sh\n").unwrap();
    fs::write(dir.join("spec.json"), r#"{"kind":"install","app_version":"0.1.0","os":"ubuntu","arch":"x86_64",
      "components":[{"ci":"embedforge-app","kind":"app_back_end_module","version":"0.1.0","title":"app",
        "changelog":[{"version":"0.1.0","date":"2026-10-12","text":"t"}]}],
      "files":[{"path":"install.sh","from":"files/install.sh","role":"script"}]}"#).unwrap();
    find_media(root).into_iter().next().unwrap()
}

#[test]
fn kit_is_signed_assembled_and_verified_sec02() {
    let t = tempfile::tempdir().unwrap();
    let m = kit_medium(t.path());
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let trusted = vec![kp.pk.to_base64()];
    let signer = KeySigner::new(kp.sk);
    let out = t.path().join("signed");
    let r = sign_medium(&m, &out, &signer, &trusted, None, &mut |_| {}).unwrap();
    assert_eq!(r.components, 1);
    assert_eq!(r.index_sha256.len(), 64);
    let keys: Vec<&str> = trusted.iter().map(String::as_str).collect();
    let idx = ef_pack::load_index(&r.out, ef_pack::MEDIUM_INDEX, &keys).unwrap();
    assert!(r.out.join("install.sh").is_file());
    // the exec bit recorded in .ef-exec survives into the pack and the manifest tier
    let x = t.path().join("x");
    ef_pack::extract_component(&r.out, &idx.components[0], &x).unwrap();
    assert!(
        !x.join(".ef-exec").exists(),
        "staging-only file is not installed"
    );
    let cm = ef_integrity::load_component(&x, &keys).unwrap();
    let bin = cm
        .files
        .iter()
        .find(|f| f.path == "bin/embedforge")
        .unwrap();
    assert_eq!(bin.tier, ef_integrity::Tier::Startup);
    assert!(cm.files.iter().all(|f| f.path != ".ef-exec"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(x.join("bin/embedforge"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }
    // running the kit twice gives a fresh, valid medium
    sign_medium(&m, &out, &signer, &trusted, None, &mut |_| {}).unwrap();
}

#[test]
fn a_key_that_is_not_a_release_key_is_refused_at_once() {
    let t = tempfile::tempdir().unwrap();
    let m = kit_medium(t.path());
    let release = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let other = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let e = sign_medium(
        &m,
        &t.path().join("signed"),
        &KeySigner::new(other.sk),
        &[release.pk.to_base64()],
        None,
        &mut |_| {},
    )
    .unwrap_err();
    assert!(
        e.contains("not one of the NETApps Electric Simulation release keys"),
        "{e}"
    );
    assert!(
        !t.path().join("signed/ubuntu-x86_64").exists(),
        "nothing is assembled"
    );
}
