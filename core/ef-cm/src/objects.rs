//! Content-addressed object store: `objects/<aa>/<rest-of-sha256>`. Identical files are stored
//! once (F0-20: content-addressed recovery store).

use crate::{io, CmError};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ObjectStore {
    root: PathBuf,
}

pub fn sha256_file(path: &Path) -> Result<(String, u64), CmError> {
    let mut f = io(path, fs::File::open(path))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut n = 0u64;
    loop {
        let k = io(path, f.read(&mut buf))?;
        if k == 0 {
            break;
        }
        h.update(&buf[..k]);
        n += k as u64;
    }
    Ok((hex::encode(h.finalize()), n))
}

impl ObjectStore {
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, CmError> {
        let root = root.into();
        io(&root, fs::create_dir_all(root.join("objects")))?;
        Ok(Self { root })
    }

    pub fn path_of(&self, sha: &str) -> PathBuf {
        self.root.join("objects").join(&sha[..2]).join(&sha[2..])
    }

    pub fn has(&self, sha: &str) -> bool {
        self.path_of(sha).is_file()
    }

    /// Stores a copy of `src`; returns (sha256, size). Existing objects are not rewritten.
    pub fn put(&self, src: &Path) -> Result<(String, u64), CmError> {
        let (sha, size) = sha256_file(src)?;
        let dst = self.path_of(&sha);
        if !dst.exists() {
            io(
                dst.parent().unwrap(),
                fs::create_dir_all(dst.parent().unwrap()),
            )?;
            let tmp = dst.with_extension("part");
            io(&tmp, fs::copy(src, &tmp))?;
            io(&dst, fs::rename(&tmp, &dst))?;
        }
        Ok((sha, size))
    }

    /// Copies object `sha` to `dst`, verifying its hash on the way (a corrupted object is
    /// reported, never restored).
    pub fn restore_to(&self, sha: &str, dst: &Path) -> Result<(), CmError> {
        let src = self.path_of(sha);
        if !src.is_file() {
            return Err(CmError::MissingObject(sha.into()));
        }
        let (got, _) = sha256_file(&src)?;
        if got != sha {
            return Err(CmError::Rule(format!(
                "recovery object {sha} is itself corrupted"
            )));
        }
        if let Some(p) = dst.parent() {
            io(p, fs::create_dir_all(p))?;
        }
        let tmp = dst.with_extension("ef-restore");
        io(&tmp, fs::copy(&src, &tmp))?;
        io(dst, fs::rename(&tmp, dst))
    }

    /// Deletes objects not in `keep`; returns the number removed.
    pub fn gc(&self, keep: &HashSet<String>) -> Result<usize, CmError> {
        let mut removed = 0;
        let objs = self.root.join("objects");
        for d in io(&objs, fs::read_dir(&objs))? {
            let d = io(&objs, d)?.path();
            if !d.is_dir() {
                continue;
            }
            for f in io(&d, fs::read_dir(&d))? {
                let f = io(&d, f)?.path();
                let sha = format!(
                    "{}{}",
                    d.file_name().unwrap().to_string_lossy(),
                    f.file_name().unwrap().to_string_lossy()
                );
                if !keep.contains(&sha) {
                    io(&f, fs::remove_file(&f))?;
                    removed += 1;
                }
            }
        }
        Ok(removed)
    }
}
