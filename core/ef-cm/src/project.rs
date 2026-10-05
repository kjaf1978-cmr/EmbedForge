//! Project repositories (DATA-01) with baselines as annotated Git tags (CM-03).
//! Restoring a baseline creates a new commit whose tree equals the baseline's tree, so the
//! history is kept and the restore itself can be undone.

use crate::CmError;
use git2::{IndexAddOption, ObjectType, Oid, Repository, Signature};
use std::path::{Path, PathBuf};

pub struct ProjectRepo {
    repo: Repository,
    dir: PathBuf,
}

const BASELINE_PREFIX: &str = "baseline/";

impl ProjectRepo {
    /// Creates a new project (all files at the current schema) and its first commit.
    pub fn create(dir: &Path, name: &str, target_board: &str) -> Result<Self, CmError> {
        std::fs::create_dir_all(dir).map_err(|source| CmError::Io {
            path: dir.into(),
            source,
        })?;
        let repo = Repository::init(dir)?;
        ef_schema::create_project(dir, name, target_board)?;
        let me = Self {
            repo,
            dir: dir.into(),
        };
        me.commit_all("Create project")?;
        Ok(me)
    }

    pub fn open(dir: &Path) -> Result<Self, CmError> {
        Ok(Self {
            repo: Repository::open(dir)?,
            dir: dir.into(),
        })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn sig(&self) -> Result<Signature<'static>, CmError> {
        // Projects carry no host-specific data (DATA-03): a fixed author identity is used.
        Ok(Signature::now("EmbedForge", "embedforge@localhost")?)
    }

    /// Commits every change in the working tree (validated first). Returns None when there
    /// is nothing to commit.
    pub fn commit_all(&self, message: &str) -> Result<Option<Oid>, CmError> {
        ef_schema::validate_project(&self.dir)?;
        let mut index = self.repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.update_all(["*"].iter(), None)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let parent = match self.repo.head() {
            Ok(h) => Some(h.peel_to_commit()?),
            Err(_) => None,
        };
        if let Some(p) = &parent {
            if p.tree_id() == tree_id {
                return Ok(None);
            }
        }
        let tree = self.repo.find_tree(tree_id)?;
        let sig = self.sig()?;
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        Ok(Some(self.repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &parents,
        )?))
    }

    /// CM-03: tags HEAD as a baseline. The working tree must be clean.
    pub fn tag_baseline(&self, name: &str, message: &str) -> Result<Oid, CmError> {
        if self.is_dirty()? {
            return Err(CmError::Rule(
                "commit or discard changes before tagging a baseline".into(),
            ));
        }
        let head = self.repo.head()?.peel(ObjectType::Commit)?;
        Ok(self.repo.tag(
            &format!("{BASELINE_PREFIX}{name}"),
            &head,
            &self.sig()?,
            message,
            false,
        )?)
    }

    pub fn baselines(&self) -> Result<Vec<String>, CmError> {
        let mut v: Vec<String> = self
            .repo
            .tag_names(Some(&format!("{BASELINE_PREFIX}*")))?
            .iter()
            .flatten()
            .flatten()
            .map(|s| s.trim_start_matches(BASELINE_PREFIX).to_string())
            .collect();
        v.sort();
        Ok(v)
    }

    pub fn is_dirty(&self) -> Result<bool, CmError> {
        let mut o = git2::StatusOptions::new();
        o.include_untracked(true);
        Ok(!self.repo.statuses(Some(&mut o))?.is_empty())
    }

    /// CM-03: restores the project to a baseline in one action, as a new commit.
    pub fn restore_baseline(&self, name: &str) -> Result<Oid, CmError> {
        if self.is_dirty()? {
            return Err(CmError::Rule(
                "commit or discard changes before restoring a baseline".into(),
            ));
        }
        let target = self
            .repo
            .revparse_single(&format!("refs/tags/{BASELINE_PREFIX}{name}"))?
            .peel_to_commit()?;
        let tree = target.tree()?;
        let mut co = git2::build::CheckoutBuilder::new();
        co.force().remove_untracked(true);
        self.repo.checkout_tree(tree.as_object(), Some(&mut co))?;
        let mut index = self.repo.index()?;
        index.read_tree(&tree)?;
        index.write()?;
        let head = self.repo.head()?.peel_to_commit()?;
        let sig = self.sig()?;
        let id = self.repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("Restore baseline {name}"),
            &tree,
            &[&head],
        )?;
        Ok(id)
    }

    /// Number of commits on HEAD (history is never rewritten).
    pub fn history_len(&self) -> Result<usize, CmError> {
        let mut w = self.repo.revwalk()?;
        w.push_head()?;
        Ok(w.count())
    }
}
