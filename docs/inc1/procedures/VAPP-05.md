# VAPP-05 — Offline update and rollback with a USB package

**Requirement.** VAPP-05 / SS-09 / CM-09: a signed update package from USB storage is
applied offline, and the previous state is restored offline from the recovery store.

**The test package** (in the VAPP test kit, folder `usb-update`) contains two items:
- the same app with the next patch version, 0.1.1;
- a small new item, `vapp05-test-item`, that depends on app 0.1.1.

It is signed with the release key, like every update package.

## Steps (part of the same run as VAPP-03)

1. Network off. Run the kit's checks.
2. The check does the following:
   - applies the package;
   - checks that both items changed;
   - restores the baseline `install-0.1.0`, which the installer tagged (CM-03);
   - checks that the active versions are exactly the installed ones again.

## Expected result

```
PASS VAPP-05 — Offline update and rollback with a USB package (SS-09, CM-09)
    updated embedforge-app: 0.1.0 → 0.1.1
    updated vapp05-test-item: (new) → 1.0.0
    baseline install-0.1.0 restored offline, changed [...]
    active versions equal the installed ones again; the update stays in the recovery store
```

## Optional manual variant

Open a terminal (Linux) or Command Prompt as administrator (Windows). In the
`embedforge-app/bin` folder of the installation:

1. `embedforge-setup update --package <kit>/usb-update`
   - **Expected:** two items updated.
2. `embedforge-setup versions`
   - **Expected:** `embedforge-app 0.1.0 [0.1.1]`; the active version is in brackets.
3. `embedforge-setup rollback --item embedforge-app --to 0.1.0`
   - **Expected:** refused. The message names `vapp05-test-item`, which needs app ≥ 0.1.1
     (CM-04 dependency check).
4. `embedforge-setup restore-baseline --name install-0.1.0`
   - **Expected:** restored. `versions` now shows `[0.1.0]` again.

**Unsigned or wrongly signed packages:** the same `update` command refuses them; the error
names the signature.
