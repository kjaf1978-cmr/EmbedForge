# Project files

A project is a folder under version control (Git), made of text files:

| File | Contents |
|---|---|
| project.json | Name, target board, build style, part style, status, pinned versions |
| requirements.json | Requirements |
| interfaces.json | Blocks and their interfaces |
| parameters.json | Every parameter, with unit and valid range |
| netlist.json | Parts and their connections: the single source of truth for connectivity |
| geometry.json | Positions and shapes drawn in each view |
| pinmap.json | Derived from the netlist (cache) |
| migrations.json | Record of automatic format upgrades |

**Rules:**
- Every file carries a `schema` tag. Files made by older versions of EmbedForge are upgraded
  automatically, and each upgrade is recorded. Files made by a newer version are refused, so
  nothing is silently lost.
- Project files never contain absolute paths, user names or serial-port names, so a project
  opens on any supported computer.
- The first release supports up to 100 parts, 120 nets and boards up to 110 mm on the longest
  side and 10 000 mm² in area. Larger projects open with a warning.
