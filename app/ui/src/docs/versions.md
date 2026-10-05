# Versions, baselines and the recovery store

Everything EmbedForge uses is a **configuration item** with a version and a changelog:
- the application;
- runtimes, toolchains and models;
- libraries, board definitions and component models;
- the catalogue and fabrication profiles;
- each of your projects.

- **Baseline:** a named set of versions. Restoring a baseline is one action.
  - For a project, the restore is recorded as a new version, so it can itself be undone.
- **Downgrade:** any item can go back to an earlier version kept on this computer. The
  dependency check runs first; if the downgrade would break another item, it is refused and
  the conflict is named.
- **Recovery store:** keeps earlier versions so that rollback and repair need no network.
  Identical files are stored once.
  - You can set a retention limit.
  - Versions used by your projects are never removed.
  - Before baselines are deleted, EmbedForge lists them and asks you to confirm.
