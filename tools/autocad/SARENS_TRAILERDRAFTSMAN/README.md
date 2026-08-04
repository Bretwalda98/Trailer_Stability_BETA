# SARENS_TRAILERDRAFTSMAN v1.1

SARENS_TRAILERDRAFTSMAN is an AutoCAD AutoLISP tool for producing trailer arrangement drawings from the Sarens trailer calculation workbook. It imports the standard block library, draws the model views, creates/fits the PaperSpace sheet, scales the viewport output, and updates the title block.

## Release Contents

- `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` - the AutoLISP program.
- `Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` - the unified block and PaperSpace layout library.
- `Autocad Blocks\Autocad Blocks.zip` - packaged copy of the block library folder.

Keep the `.lsp` file and the `Autocad Blocks` folder together in the same parent folder.

## Requirements

- AutoCAD for Windows with AutoLISP/Visual LISP support.
- Microsoft Excel installed locally.
- A compatible Sarens trailer calculation workbook containing the expected `Load and Stability Calculation` and `Export to DWG` sheets.
- The bundled `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` file.

## Installation

1. Copy or keep the full `SARENS_TRAILERDRAFTSMAN` folder somewhere stable on your PC or network drive.
2. In AutoCAD, add the folder containing `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` to Trusted Locations if AutoCAD blocks loading from that location.
3. Run `APPLOAD`.
4. Browse to and load `SARENS_TRAILERDRAFTSMAN_v1.1.lsp`.
5. Optional: add `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` to the AutoCAD Startup Suite if you want it to load automatically in new drawings.

When loaded successfully, AutoCAD prints a message ending with:

```text
SARENS_TRAILERDRAFTSMAN v1.1 full release loaded. Commands: SARTDRUN and SARTDWEB.
```

## Block Library Folder

The program now checks for the block library in this order:

1. The saved `SARTD_LIBRARY_DWG` path.
2. The saved `SARTD_BLOCKS_FOLDER` folder.
3. The bundled `Autocad Blocks` folder beside the loaded `.lsp` file.
4. AutoCAD's normal support file search paths.
5. A prompt asking you to select the `Autocad Blocks` folder.

If AutoCAD asks for the blocks folder, select the folder named:

```text
Autocad Blocks
```

That folder must contain:

```text
SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg
```

After a successful selection, the program remembers the folder and DWG path for future runs. If the folder picker is unavailable, or the selected folder does not contain the library DWG, the program falls back to asking you to select the DWG file directly.

## Usage

1. Open the trailer calculation workbook in Excel, or have it ready to browse to.
2. Open or create the target drawing in AutoCAD.
3. Load the Lisp if it is not already loaded.
4. Run:

```text
SARTDRUN
```

5. Choose the Excel source:

- `Active` - use the currently active Excel workbook.
- `Browse` - choose a workbook file.
- `Last` - reuse the last workbook selected by this tool.

6. Follow any AutoCAD command line prompts. On the first run, you may be asked for the `Autocad Blocks` folder.
7. When complete, the drawing should remain in PaperSpace with the sheet fitted to the screen.

`SARTDRUN` remains the standard v1.1 command. `SARTDWEB` is the website transfer command. Older development commands are retired by the release load process.

## Optional automatic bridge

`SARENS_AutoCAD_Bridge.ps1` is a local-only Windows helper. Start it from PowerShell before using the website's **Export to AutoCAD** button. The bridge watches the Downloads folder for the generated transfer-code workbook, starts or attaches to AutoCAD, creates a drawing when required, loads the LSP and runs `SARTDWEB`.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\SARENS_AutoCAD_Bridge.ps1
```

If the bridge is not running, the website still works: download the workbook, open AutoCAD, run `SARTDWEB`, and enter the displayed code manually.

## Website transfer workflow

The Trailer Stability website has an **Export to AutoCAD** action. It exports a recalculation-ready workbook with a six-digit transfer code in the filename:

```text
SARENS_AUTOCAD_482731.xlsm
```

After downloading the file, run this command in AutoCAD:

```text
SARTDWEB
```

Enter the six-digit code when prompted. The command searches the Windows Downloads folder, opens the matching workbook through Excel, and runs the complete drawing workflow without asking for the Excel source again. If the file is stored elsewhere, set the `SARTD_DOWNLOAD_FOLDER` environment variable to the exchange folder before running AutoCAD.

`SARTDRUN` remains available for the normal Active/Browse/Last workflow.

## Troubleshooting

- If blocks are missing, rerun `SARTDRUN` and select the correct `Autocad Blocks` folder when prompted.
- If the wrong block path was saved, run these at the AutoCAD command line and then rerun `SARTDRUN`:

```lisp
(setenv "SARTD_BLOCKS_FOLDER" "")
(setenv "SARTD_LIBRARY_DWG" "")
```

- If Excel cannot be read, make sure the workbook is open, not protected in a way that blocks reading, and contains the expected sheets.
- If AutoCAD refuses to load the Lisp, add the program folder to AutoCAD Trusted Locations.
