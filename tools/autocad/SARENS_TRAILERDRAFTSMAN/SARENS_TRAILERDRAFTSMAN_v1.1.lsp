; =================================================================================================
; SARENS_TRAILERDRAFTSMAN v1.1 full release
; User command:
;   SARTDRUN - full workflow: choose Excel source, draw model, import PaperSpace sheet,
;              fit/scale viewport, update trailer annotations, and update border/title block.
;
; Supports KAMAG K2400 ST / K24 and KAMAG K2500 / K25 W3000 dynamic assembly blocks.
; Reads S-24-74232 style Excel workbook, draws plan/side/end, load, packing, COGs and trailer blocks.
; =================================================================================================

(vl-load-com)

; ----------------------------- CONSTANTS ---------------------------------------------------------
(setq sartd:*app* "SARENS_TRAILERDRAFTSMAN")
(setq sartd:*version* "1.15")
(setq sartd:*sheet-main* "Load and Stability Calculation")
(setq sartd:*sheet-export* "Export to DWG")
(setq sartd:*auto-excel-source* nil) ; internal: when set to "Active"/"Last"/"Browse", skips Excel source prompt

(setq sartd:*block-side*  "$0$K2400 ST (K24)_(7.1.2)_Simplified_SIDE")
(setq sartd:*block-front* "$0$K2400 ST (K24)_(7.1.2)_Simplified_FRONT")
(setq sartd:*block-top*   "$0$K2400 ST (K24)_(7.1.2)_Simplified_TOP 02")

; v0.9.9.4.3.45: K25/K2500 W3000 dynamic assembly blocks added to the unified block library.
; These blocks use dynamic Custom properties such as Length, Axle Lines, Height, Type and Draw Bar/PPU.
(setq sartd:*block-k25-top-candidates*
  '("$0$KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) TOP 01"
    "KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) TOP 01"))
(setq sartd:*block-k25-side-candidates*
  '("$0$KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) SIDE 01"
    "KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) SIDE 01"))
(setq sartd:*block-k25-front-candidates*
  '("$0$KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) FRONT 01"
    "KAMAG K2500 W3000 Simple Assembly (4 - 42 Axles) FRONT 01"))

; v0.8.4 unified block library.
; This one DWG should contain all model blocks and the official PaperSpace template.
(setq sartd:*library-env* "SARTD_LIBRARY_DWG")
(setq sartd:*library-default-name* "SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg")
(setq sartd:*block-cog* "$0$Sarens COG")
(setq sartd:*group-blocks*
  '((1 . "SARTD_GROUP_1_SQUARE")
    (2 . "SARTD_GROUP_2_SQUARE")
    (3 . "SARTD_GROUP_3_SQUARE")))

; K24 hydraulic group square centre-to-centre spacing.
; The square block insertion point is its centre and is placed directly on the K24 axle-centre cross.
(setq sartd:*k24-group-x-spacing* 1400.0)
(setq sartd:*k24-group-y-spacing* 1450.0)
; v0.8.6.1: Group square insertion point is the centre of the square, placed directly on the K24 plan block axle-centre crosses.
; If the library K24 block base point changes later, these are the only offsets to tweak.
(setq sartd:*k24-group-first-axle-x-offset* 700.0)
(setq sartd:*k24-group-lower-row-y-offset* -725.0)

; Pinned axle marker placement in side view.
; Axle X is based on the same K24 1400 pitch as the plan view; this offset lands on the knee-hole centre.
; v0.9.7 calibration: moved 120mm right and 69mm down from v0.9.6 test result.
(setq sartd:*k24-pinned-marker-x-offset-from-axle* -580.0)
(setq sartd:*k24-pinned-marker-y-from-ground* 656.0)

; Scale-aware drafting gaps. These get larger when a PaperSpace viewport scale is selected.
(setq sartd:*dim-gap-min* 350.0)
(setq sartd:*dim-title-clearance-min* 2200.0)

; v0.9.0 staged drafting / scale constants.
(setq sartd:*block-coordinate* "COORDINATE (X-Y) SYMBOL")
(setq sartd:*block-pinned-axle* "SV_K24_Pinned_Axle")
(setq sartd:*block-pinned-axle-plan* "TV_K24_Pinned_Axle")
; Groundline block names that may exist in the unified library. First match is used.
; v0.9.8: official library block name is $1$Ground_Hatch.
(setq sartd:*ground-block-candidates*
  '("$1$Ground_Hatch" "$0$Ground_Hatch" "Ground_Hatch" "SARTD_GROUNDLINE" "SARENS_GROUNDLINE" "GROUNDLINE" "Groundline" "GroundLine"))
(setq sartd:*ground-block-default-length* 1000.0)
(setq sartd:*view-gap-x* 6500.0)
(setq sartd:*view-gap-y* 6500.0)
(setq sartd:*ground-overrun* 250.0)
(setq sartd:*default-callout-scale* 200.0)

; v0.9.9.4.3.21 internal standard viewport scale list.
; These scales are NOT added to AutoCAD's scale list.
; SARTDAUTOFIT uses this list internally and sets viewport CustomScale directly.
(setq sartd:*standard-scale-denominators*
  '(1 2 5 10 20 25 33 40 50 60 75 80 100 125 150 175 200 225 250 275 300 333 350 400 450 500 600 750 1000 1250 1500 2000 2500 5000))
(setq sartd:*standard-scale-add-list*
  '(("1:1" . 1.0)
    ("1:2" . 2.0)
    ("1:5" . 5.0)
    ("1:10" . 10.0)
    ("1:20" . 20.0)
    ("1:25" . 25.0)
    ("1:33.3" . 33.333333)
    ("1:40" . 40.0)
    ("1:50" . 50.0)
    ("1:60" . 60.0)
    ("1:75" . 75.0)
    ("1:80" . 80.0)
    ("1:100" . 100.0)
    ("1:125" . 125.0)
    ("1:150" . 150.0)
    ("1:175" . 175.0)
    ("1:200" . 200.0)
    ("1:225" . 225.0)
    ("1:250" . 250.0)
    ("1:275" . 275.0)
    ("1:300" . 300.0)
    ("1:333" . 333.333333)
    ("1:350" . 350.0)
    ("1:400" . 400.0)
    ("1:450" . 450.0)
    ("1:500" . 500.0)
    ("1:600" . 600.0)
    ("1:750" . 750.0)
    ("1:1000" . 1000.0)
    ("1:1250" . 1250.0)
    ("1:1500" . 1500.0)
    ("1:2000" . 2000.0)
    ("1:2500" . 2500.0)
    ("1:5000" . 5000.0)))

(setq sartd:*dimstyle-standard* "SAR_DIM")
(setq sartd:*dimstyle-reference* "SAR_DIM_Reference")
(setq sartd:*dimstyle-k24-axle* "SAR_DIM_SPMT_1400")
(setq sartd:*k24-deck-min* 1250.0)
(setq sartd:*k24-deck-max* 1750.0)

; Sarens standard layer mapping for generated drawing objects.
(setq sartd:*layer-load*     "7 - Load")
(setq sartd:*layer-dim*      "Dim - 01")
(setq sartd:*layer-viewport* "Defpoints")
(setq sartd:*layer-cog*      "1") ; Sarens red plotting layer for COG blocks

(setq sartd:*layers*
  '(("SARTD-TRAILER"  . 7)
    ("SARTD-PACKING"  . 2)
    ("SARTD-COG"      . 1)
    ("SARTD-GROUND"   . 8)
    ("SARTD-DEBUG"    . 6)
    ("SARTD-ANNOTATION" . 7)
    ("SARTD-HYD-GROUP" . 7)
    ("SARTD-HYD-TRI"   . 1)
    ("7 - Load"       . 7)
    ("Dim - 01"       . 5)
    ("Defpoints"      . 7)
    ("1"              . 1)
    ("2"              . 2)))

; ----------------------------- SMALL UTILITIES ---------------------------------------------------
(defun sartd:pr (msg) (princ (strcat "\n[SARTD] " msg)))

(defun sartd:envstr (name / v)
  ; getfiled requires a string default path. getenv returns nil when unset,
  ; which caused v0.5 to fail with: bad argument type: stringp nil.
  (setq v (getenv name))
  (if (and v (= (type v) 'STR)) v ""))

(defun sartd:unvariant (v / vv)
  ; Excel COM Range.Value2 often arrives as a VARIANT. V0.1 did not unwrap this,
  ; which caused valid numbers to be converted to 0 and blank cells to print as #<variant ...>.
  (cond
    ((= (type v) 'VARIANT)
      (setq vv (vl-catch-all-apply 'vlax-variant-value (list v)))
      (if (vl-catch-all-error-p vv) nil (sartd:unvariant vv)))
    (T v)))


(defun sartd:to-list (v / vv)
  ; Converts COM VARIANT / SAFEARRAY / list responses into a normal AutoLISP list.
  (cond
    ((null v) nil)
    ((vl-catch-all-error-p v) nil)
    ((= (type v) 'VARIANT)
      (setq vv (vlax-variant-value v))
      (sartd:to-list vv))
    ((= (type v) 'SAFEARRAY) (vlax-safearray->list v))
    ((listp v) v)
    (T nil)))

(defun sartd:clean-numstr (s / out i ch stop)
  ; Keeps a simple leading numeric value from text such as "1.50m" or "73.2 Te".
  (setq s (vl-string-translate "," "." (vl-string-trim " \t\n\r" (sartd:str s))))
  (setq out "" i 1 stop nil)
  (while (and (<= i (strlen s)) (not stop))
    (setq ch (substr s i 1))
    (cond
      ((wcmatch ch "[0-9]") (setq out (strcat out ch)))
      ((or (= ch ".") (= ch "-") (= ch "+")) (setq out (strcat out ch)))
      ((> (strlen out) 0) (setq stop T)))
    (setq i (1+ i)))
  out)

(defun sartd:str (v)
  (setq v (sartd:unvariant v))
  (cond
    ((null v) "")
    ((= (type v) 'STR) v)
    (T (vl-princ-to-string v))))

(defun sartd:num (v def / s n)
  (setq v (sartd:unvariant v))
  (cond
    ((numberp v) (float v))
    ((and (= (type v) 'STR) (/= (vl-string-trim " \t\n\r" v) ""))
      (setq s (sartd:clean-numstr v))
      (if (and (/= s "") (setq n (distof s 2))) (float n) def))
    (T def)))

(defun sartd:int (v def)
  (fix (+ 0.5 (sartd:num v def))))

(defun sartd:m->mm (v) (* 1000.0 (sartd:num v 0.0)))

(defun sartd:yesp (v / s)
  (setq s (strcase (vl-string-trim " \t\n\r" (sartd:str v))))
  (or (= s "YES") (= s "Y") (= s "TRUE") (= s "1") (= s "LEFT") (= s "RIGHT")))

(defun sartd:norm (s / out i ch)
  (setq s (strcase (sartd:str s)))
  (setq out "" i 1)
  (while (<= i (strlen s))
    (setq ch (substr s i 1))
    (if (wcmatch ch "[A-Z0-9]") (setq out (strcat out ch)))
    (setq i (1+ i)))
  out)

(defun sartd:pt (x y z) (vlax-3d-point (list (float x) (float y) (float z))))
(defun sartd:2dpt (x y / arr)
  (setq arr (vlax-make-safearray vlax-vbDouble '(0 . 1)))
  (vlax-safearray-fill arr (list (float x) (float y)))
  (vlax-make-variant arr))
(defun sartd:first-current-paper-layout (/ names n out)
  (setq names (sartd:layout-names-current))
  (setq out nil)
  (foreach n names
    (if (and (not out) (/= (strcase (sartd:str n)) "MODEL"))
      (setq out n)))
  out)



(defun sartd:scale-denom->string (den / s)
  (setq s (rtos (float den) 2 6))
  (while (and (> (strlen s) 1) (= (substr s (strlen s) 1) "0"))
    (setq s (substr s 1 (1- (strlen s)))))
  (if (= (substr s (strlen s) 1) ".")
    (setq s (substr s 1 (1- (strlen s)))))
  s)

(defun sartd:scale-record-has-name-p (rec name / n item out)
  ; Checks an AcDbScale entget list for its visible scale name.
  ; Important: v0.9.9.4.3.18 accidentally created XRECORDs. Those do not show in
  ; AutoCAD's scale list UI, so v0.9.9.4.3.19 only treats true SCALE/AcDbScale
  ; objects as valid existing scales.
  (setq n (strcase (sartd:str name)))
  (setq out nil)
  (if (member (strcase (sartd:str (cdr (assoc 0 rec)))) '("SCALE" "ACDBSCALE"))
    (foreach item rec
      (if (and (not out) (= (car item) 300) (= (strcase (sartd:str (cdr item))) n))
        (setq out T))))
  out)

(defun sartd:scale-exists-p (name / dictRec dict entry obj data found)
  ; v0.9.9.4.3.19: scan ACAD_SCALELIST for real SCALE objects only.
  ; This makes the check match what the user sees in -SCALELISTEDIT / viewport scale dropdown.
  (setq found nil)
  (setq dictRec (vl-catch-all-apply 'dictsearch (list (namedobjdict) "ACAD_SCALELIST")))
  (if (and (not (vl-catch-all-error-p dictRec)) dictRec)
    (progn
      (setq dict (cdr (assoc -1 dictRec)))
      (setq entry (dictnext dict T))
      (while (and entry (not found))
        (setq obj (cdr (assoc 350 entry)))
        (if obj
          (progn
            (setq data (entget obj))
            (if (sartd:scale-record-has-name-p data name)
              (setq found T))))
        (if (not found) (setq entry (dictnext dict))))))
  found)

(defun sartd:scale-dict-next-key (dict base / i key)
  ; Creates a safe unique dictionary key for an AcDbScale object.
  (setq i 0)
  (setq key base)
  (while (dictsearch dict key)
    (setq i (1+ i))
    (setq key (strcat base "_" (itoa i))))
  key)

(defun sartd:add-scale-to-scalelist (name denom / dictRec dict key scaleObj den)
  ; v0.9.9.4.3.19: silently add a real AcDbScale object to ACAD_SCALELIST.
  ; v0.9.9.4.3.18 used XRECORDs, which did not appear in the AutoCAD scale list.
  (setq den (sartd:num denom 0.0))
  (cond
    ((or (not name) (<= den 0.0)) nil)
    ((sartd:scale-exists-p name) nil)
    (T
      (setq dictRec (vl-catch-all-apply 'dictsearch (list (namedobjdict) "ACAD_SCALELIST")))
      (if (or (vl-catch-all-error-p dictRec) (not dictRec))
        nil
        (progn
          (setq dict (cdr (assoc -1 dictRec)))
          (setq key (sartd:scale-dict-next-key dict (strcat "SARTD_" (vl-string-translate ":." "__" name))))
          (setq scaleObj
            (entmakex
              (list
                (cons 0 "SCALE")
                (cons 100 "AcDbScale")
                (cons 300 name)
                (cons 140 1.0)
                (cons 141 den)
                (cons 290 0))))
          (if scaleObj
            (progn
              (dictadd dict key scaleObj)
              T)
            nil))))))

(defun sartd:ensure-standard-scales (/ )
  ; v0.9.9.4.3.21: AutoCAD scale-list modification disabled.
  ; The previous attempts to add SCALE objects were unreliable across AutoCAD profiles/templates.
  ; SARTDAUTOFIT now uses sartd:*standard-scale-denominators* internally and sets the viewport
  ; CustomScale directly, so the scales do NOT need to appear in the AutoCAD drop-down list.
  (sartd:pr "Using internal SARTD viewport scale list only. AutoCAD scale list not modified.")
  0)


(defun sartd:layout-set-command (target / r)
  ; v0.9.9.4.3.12: use AutoCAD's layout Set command as a fallback/synchronisation step.
  ; This is allowed from the Model tab and is more reliable after -LAYOUT Template
  ; than relying only on TILEMODE/CTAB/ActiveLayout changes.
  (if (and target (/= target "") (/= (strcase target) "MODEL"))
    (progn
      ;; v0.9.9.4.3.12: AutoLISP in this AutoCAD profile has no FBOUNDP.
      ;; Use VL-CMDF directly instead of testing for COMMAND-S.
      (setq r (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Set" target)))
      (not (vl-catch-all-error-p r)))
    nil))

(defun sartd:activate-paper-layout (layoutName / doc layouts lay target oldcmdecho r)
  ; v0.9.9.4.3.12: robust PaperSpace activation.
  ; Previous version used only system variables/ActiveX. AutoCAD sometimes stayed on the Model tab
  ; immediately after importing a layout from a template. This version also calls -LAYOUT Set.
  (vl-load-com)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq oldcmdecho (getvar "CMDECHO"))
  (vl-catch-all-apply 'setvar (list "CMDECHO" 0))

  (setq target (sartd:str layoutName))
  (if (or (not target) (= target "") (= (strcase target) "MODEL"))
    (progn
      (setq target (getenv "SARTD_LAST_LAYOUT"))
      (if (or (not target) (= target "") (= (strcase target) "MODEL"))
        (setq target (sartd:first-current-paper-layout)))))

  (if (and target (/= target "") (/= (strcase target) "MODEL"))
    (progn
      (setenv "SARTD_LAST_LAYOUT" target)
      ; Leave model tab first where possible, then force the target layout current.
      (vl-catch-all-apply 'setvar (list "TILEMODE" 0))
      (sartd:layout-set-command target)
      (vl-catch-all-apply 'setvar (list "CTAB" target))
      (setq layouts (vla-get-Layouts doc))
      (setq lay (vl-catch-all-apply 'vla-Item (list layouts target)))
      (if (not (vl-catch-all-error-p lay))
        (vl-catch-all-apply 'vla-put-ActiveLayout (list doc lay)))
      (vl-catch-all-apply 'vla-put-ActiveSpace (list doc 1)) ; 1 = acPaperSpace
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
      ; One more -LAYOUT Set after ActiveLayout often cures delayed template switching.
      (sartd:layout-set-command target)
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))))

  (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
  (and (= (getvar "TILEMODE") 0)
       (= (getvar "CVPORT") 1)
       target
       (/= (strcase (getvar "CTAB")) "MODEL"))
)

(defun sartd:go-paperspace (/ ok target)
  ; v0.9.9.4.3.12: robust PaperSpace switch with no PSPACE command call.
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (setq ok (sartd:activate-paper-layout target))
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "Still on the Model tab. SARTD could not activate a PaperSpace layout automatically."))
    ((/= (getvar "CVPORT") 1)
      (sartd:pr "Still inside a floating viewport. Click PaperSpace/PSPACE once, then rerun the command.")))
  ok)

(defun sartd:go-modelspace (/ doc)
  ; v0.8.3.8: model drawing command is separated from paper setup.
  ; Force the command into ModelSpace before asking for model-space points.
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'setvar (list "TILEMODE" 1))
  (vl-catch-all-apply 'vlax-put-property (list doc 'ActiveSpace 0)) ; 0 = ModelSpace
  (princ))

(defun sartd:getpoint-safe (prompt / p)
  ; Safe point prompt for annotation insertion. Returns nil if the user cancels.
  (setq p (vl-catch-all-apply 'getpoint (list prompt)))
  (if (vl-catch-all-error-p p) nil p))
(defun sartd:addpt (p dx dy dz) (list (+ (car p) dx) (+ (cadr p) dy) (+ (if (caddr p) (caddr p) 0.0) dz)))
(defun sartd:g (key data) (cdr (assoc key data)))

(setq sartd:*space-override* nil)

(defun sartd:modelspace (/ doc)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vla-get-ModelSpace doc))

(defun sartd:paperspace (/ doc)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vla-get-PaperSpace doc))

(defun sartd:space (/ doc)
  ; v0.8.3.1: geometry can be forced into ModelSpace and annotations into PaperSpace.
  (if sartd:*space-override*
    sartd:*space-override*
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (cond
        ((= (getvar "TILEMODE") 1) (vla-get-ModelSpace doc))
        ((= (getvar "CVPORT") 1) (vla-get-PaperSpace doc))
        (T (vla-get-ModelSpace doc))))))

(defun sartd:with-space (space thunk / old res)
  (setq old sartd:*space-override*)
  (setq sartd:*space-override* space)
  (setq res (vl-catch-all-apply thunk nil))
  (setq sartd:*space-override* old)
  (if (vl-catch-all-error-p res)
    (progn (sartd:pr (strcat "Space operation error: " (vl-catch-all-error-message res))) nil)
    res))

(defun sartd:ensure-layer (name colour / doc layers lay created)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layers (vla-get-Layers doc))
  (if (not (tblsearch "LAYER" name))
    (progn
      (setq lay (vla-Add layers name))
      (setq created T))
    (progn
      (setq lay (vla-Item layers name))
      (setq created nil)))
  ; Do not overwrite Sarens template layer colours if the layer already exists.
  (if (and created colour) (vla-put-Color lay colour))
  lay)

(defun sartd:setup-layers ()
  (foreach x sartd:*layers* (sartd:ensure-layer (car x) (cdr x))))

(defun sartd:tag (ename role / ed)
  ; Simple XDATA tag for later upgrades. Refresh v0.1 deletes by SARTD-* layers.
  (if ename
    (progn
      (regapp sartd:*app*)
      (setq ed (entget ename))
      (entmod
        (append ed
          (list
            (list -3
              (list sartd:*app*
                (cons 1000 "SARTD")
                (cons 1000 (sartd:str role)))))))))
  ename)

(defun sartd:xdata-role (ent / xd vals roles)
  (setq xd (assoc -3 (entget ent (list sartd:*app*))))
  (if xd
    (progn
      (setq vals (cdr (cadr xd)))
      (setq roles (mapcar 'cdr (vl-remove-if-not '(lambda (x) (= (car x) 1000)) vals)))
      (if (and roles (member "SARTD" roles))
        (if (> (length roles) 1) (cadr roles) "")
        nil))
    nil))

(defun sartd:generated-entity-p (ent / layer role)
  ; New versions use XDATA so we can put geometry on Sarens standard layers
  ; without deleting unrelated user objects on those same layers.
  (setq layer (cdr (assoc 8 (entget ent))))
  (setq role (sartd:xdata-role ent))
  (if (and role (/= (strcase (sartd:str layer)) "SARTD-ANNOTATION") (/= (strcase role) "ANNOTATION")) T nil))

(defun sartd:delete-generated (/ ss i ent filter layer)
  ; Refresh deletes previous generated model geometry/dimensions/auto viewports only.
  ; It does NOT delete annotation blocks. New standard-layer objects are selected by XDATA.
  (setq filter
    (list
      '(-4 . "<OR")
      '(8 . "SARTD-TRAILER")
      '(8 . "SARTD-LOAD")
      '(8 . "SARTD-PACKING")
      '(8 . "SARTD-COG")
      '(8 . "SARTD-GROUND")
      '(8 . "SARTD-TEXT")
      '(8 . "SARTD-DIMS")
      '(8 . "SARTD-VIEWPORT")
      '(-3 ("SARENS_TRAILERDRAFTSMAN"))
      '(-4 . "OR>")))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" filter)))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq layer (strcase (sartd:str (cdr (assoc 8 (entget ent))))))
        (if (or (wcmatch layer "SARTD-*") (sartd:generated-entity-p ent))
          (entdel ent))
        (setq i (1+ i)))
      (sartd:pr "Deleted previous SARTD generated model/viewport object(s).")))
  (sartd:remove-sartd-text-layer)
  (princ))

(defun sartd:remove-sartd-text-layer (/ doc lays lay cur)
  ; v0.9.9.4.2: this layer is no longer used. Remove it when empty.
  (vl-load-com)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq lays (vla-get-Layers doc))
  (setq cur (strcase (sartd:str (getvar "CLAYER"))))
  (if (= cur "SARTD-TEXT") (setvar "CLAYER" "0"))
  (setq lay (vl-catch-all-apply 'vla-Item (list lays "SARTD-TEXT")))
  (if (not (vl-catch-all-error-p lay))
    (vl-catch-all-apply 'vla-Delete (list lay)))
  (princ))

; ----------------------------- EXCEL ACCESS ------------------------------------------------------
(defun sartd:get-excel-app (/ xl)
  (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
  (if (vl-catch-all-error-p xl)
    (progn
      (setq xl (vlax-create-object "Excel.Application"))
      (vlax-put-property xl 'Visible :vlax-true)))
  xl)

(defun sartd:active-workbook (/ xl wb err)
  (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
  (if (vl-catch-all-error-p xl)
    nil
    (progn
      (setq err (vl-catch-all-apply 'vlax-get-property (list xl 'ActiveWorkbook)))
      (if (vl-catch-all-error-p err) nil err))))

(defun sartd:open-workbook (path / xl wbs wb)
  (setq xl (sartd:get-excel-app))
  (setq wbs (vlax-get-property xl 'Workbooks))
  (setq wb (vl-catch-all-apply 'vlax-invoke-method (list wbs 'Open path)))
  (if (vl-catch-all-error-p wb)
    (progn (sartd:pr (strcat "Could not open workbook: " path)) nil)
    wb))


(defun sartd:workbook-by-path (path / xl wbs wb out fn)
  ; Returns an already-open workbook matching PATH, avoiding Workbooks.Open every live-cycle.
  (setq out nil)
  (if (and path (/= path ""))
    (progn
      (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
      (if (not (vl-catch-all-error-p xl))
        (progn
          (setq wbs (vl-catch-all-apply 'vlax-get-property (list xl 'Workbooks)))
          (if (not (vl-catch-all-error-p wbs))
            (vlax-for wb wbs
              (if (not out)
                (progn
                  (setq fn (vl-catch-all-apply 'vlax-get-property (list wb 'FullName)))
                  (if (and (not (vl-catch-all-error-p fn)) (= (strcase fn) (strcase path)))
                    (setq out wb))))))))))
  out)

(defun sartd:choose-workbook (refresh / default opt path wb)
  (setq default (if refresh "Last" "Active"))
  (if (and (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source*)
    (setq opt sartd:*auto-excel-source*)
    (progn
      (initget "Active Browse Last")
      (setq opt (getkword (strcat "\nExcel source [Active/Browse/Last] <" default ">: ")))
      (if (null opt) (setq opt default))))
  (cond
    ((= opt "Active")
      (setq wb (sartd:active-workbook))
      (if wb
        (progn
          (setq path (vl-catch-all-apply 'vlax-get-property (list wb 'FullName)))
          (if (not (vl-catch-all-error-p path)) (setenv "SARTD_LAST_XLS" path))
          wb)
        (progn (sartd:pr "No active Excel workbook found.") nil)))
    ((= opt "Browse")
      (setq path (getfiled "Select trailer Excel calculation workbook" (sartd:envstr "SARTD_LAST_XLS") "xls;xlsx;xlsm" 0))
      (if path
        (progn (setenv "SARTD_LAST_XLS" path) (sartd:open-workbook path))
        nil))
    ((= opt "Last")
      (setq path (getenv "SARTD_LAST_XLS"))
      (if (and path (/= path ""))
        (or (sartd:workbook-by-path path) (sartd:open-workbook path))
        (progn (sartd:pr "No last workbook stored yet. Use Browse or Active first.") nil)))))

(defun sartd:sheet (wb name / sheets sh)
  (setq sheets (vlax-get-property wb 'Worksheets))
  (setq sh (vl-catch-all-apply 'vlax-get-property (list sheets 'Item name)))
  (if (vl-catch-all-error-p sh)
    (progn (sartd:pr (strcat "Sheet not found: " name)) nil)
    sh))

(defun sartd:cell (sh addr / r v)
  (if sh
    (progn
      (setq r (vl-catch-all-apply 'vlax-get-property (list sh 'Range addr)))
      (if (vl-catch-all-error-p r)
        nil
        (progn
          (setq v (vl-catch-all-apply 'vlax-get-property (list r 'Value2)))
          (if (vl-catch-all-error-p v) nil (sartd:unvariant v)))))
    nil))


(defun sartd:named-value (wb nm / names n range v app r)
  ; Preferred Excel named range reader. Used for Htrailer so the sheet can move cells later.
  (setq v nil)
  (if wb
    (progn
      (setq names (vl-catch-all-apply 'vlax-get-property (list wb 'Names)))
      (if (not (vl-catch-all-error-p names))
        (progn
          (setq n (vl-catch-all-apply 'vlax-invoke-method (list names 'Item nm)))
          (if (not (vl-catch-all-error-p n))
            (progn
              (setq range (vl-catch-all-apply 'vlax-get-property (list n 'RefersToRange)))
              (if (not (vl-catch-all-error-p range))
                (progn
                  (setq r (vl-catch-all-apply 'vlax-get-property (list range 'Value2)))
                  (if (not (vl-catch-all-error-p r)) (setq v (sartd:unvariant r))))))))
      ; Fallback through Excel.Application.Range("Name") for workbook/sheet scoped names.
      (if (null v)
        (progn
          (setq app (vl-catch-all-apply 'vlax-get-property (list wb 'Application)))
          (if (not (vl-catch-all-error-p app))
            (progn
              (setq range (vl-catch-all-apply 'vlax-get-property (list app 'Range nm)))
              (if (not (vl-catch-all-error-p range))
                (progn
                  (setq r (vl-catch-all-apply 'vlax-get-property (list range 'Value2)))
                  (if (not (vl-catch-all-error-p r)) (setq v (sartd:unvariant r)))))))))))
  v)
)

(defun sartd:celln (sh addr) (sartd:num (sartd:cell sh addr) 0.0))
(defun sartd:cellmm (sh addr) (sartd:m->mm (sartd:cell sh addr)))
(defun sartd:cells (sh addr) (sartd:str (sartd:cell sh addr)))

(defun sartd:coladdr (col row) (strcat col (itoa row)))

(defun sartd:ppu-state (left right)
  (cond
    ((and left right) "BOTH")
    (left "LEFT")
    (right "RIGHT")
    (T "NONE")))

(defun sartd:brand-from-model (m / s)
  ; Matches the latest SARENS_Trailerdataimport brand derivation.
  (setq s (strcase (vl-string-trim " \t\n\r" (sartd:str m))))
  (cond
    ((member s '("K2400 ST" "K2400 ST SPL" "K2500 3000 H" "K2500 3000" "K2500 3200 SL")) "KAMAG")
    ((= s "FAYMONVILLE G-SL") "Faymonville")
    ((member s '("GHF THP 3000" "GHF THPSL 2018" "GHF THP 3600")) "Goldhofer")
    ((= s "COMETTO MSPE") "Cometto")
    ((= s "PEKZ G4") "Scheuerle")
    ((wcmatch s "*K2400*,*K24*,*K2500*,*K25*") "KAMAG")
    ((wcmatch s "*GOLDHOFER*,*GHF*,*THP*") "Goldhofer")
    ((wcmatch s "*FAYMONVILLE*,*G-SL*,*GSL*") "Faymonville")
    ((wcmatch s "*COMETTO*,*MSPE*") "Cometto")
    (T "")))


(defun sartd:read-hydraulic-grouping (sh trailers / out idx base side1 side2 row split grpA grpB side)
  ; Reads Load and Stability Calculation hydraulic grouping table.
  ; Rows start at 138. Each trailer uses two rows: upper side then lower side.
  ; B = group before split, C = group after split, D = split after axle line number.
  (setq out nil idx 1)
  (foreach tr trailers
    (setq base (+ 138 (* 2 (1- idx))))
    (setq side1 nil side2 nil)
    (foreach side (list (list "TOP" base 1.0) (list "BOTTOM" (1+ base) 0.0))
      (setq row (cadr side))
      (setq grpA (sartd:int (sartd:cell sh (sartd:coladdr "B" row)) 0))
      (setq grpB (sartd:int (sartd:cell sh (sartd:coladdr "C" row)) grpA))
      (setq split (sartd:int (sartd:cell sh (sartd:coladdr "D" row)) 0))
      (if (> grpA 0)
        (setq out
          (append out
            (list
              (list
                (cons 'trailer-index idx)
                (cons 'trailer-row (cdr (assoc 'row tr)))
                (cons 'excel-row row)
                (cons 'side-name (car side))
                (cons 'side-factor (caddr side))
                (cons 'group-before grpA)
                (cons 'group-after grpB)
                (cons 'split-after split)))))))
    (setq idx (1+ idx)))
  out)



(defun sartd:read-pinned-axles (sh / out row trnum cols c v pins)
  ; Reads the Pinned / closed-off axle line table.
  ; Table location currently used from the Sarens Excel workbook:
  ;   F136:F147 = trailer number
  ;   G:N       = pinned axle line numbers for that specific trailer
  ; Pinned axles are trailer-specific and are excluded from hydraulic group squares and the stability triangle.
  (setq out nil)
  (setq cols '("G" "H" "I" "J" "K" "L" "M" "N"))
  (setq row 136)
  (while (<= row 147)
    (setq trnum (sartd:int (sartd:cell sh (sartd:coladdr "F" row)) 0))
    ; Fallback if the trailer number column is blank but the row order is still the standard 1 to 12.
    (if (<= trnum 0) (setq trnum (- row 135)))
    (setq pins nil)
    (foreach c cols
      (setq v (sartd:int (sartd:cell sh (sartd:coladdr c row)) 0))
      (if (> v 0) (setq pins (append pins (list v)))))
    (if pins
      (setq out (append out (list (cons trnum pins)))))
    (setq row (1+ row)))
  out)

(defun sartd:pinned-axles-for (data trailer-index / pa row)
  (setq pa (sartd:g 'pinned-axles data))
  (setq row (assoc trailer-index pa))
  (if row (cdr row) nil))

(defun sartd:axle-pinned-p (data trailer-index axle / pins)
  (setq pins (sartd:pinned-axles-for data trailer-index))
  (if (member axle pins) T nil))

(defun sartd:hyd-group-at-axle (gdef axle / split ga gb)
  (setq split (cdr (assoc 'split-after gdef)))
  (setq ga (cdr (assoc 'group-before gdef)))
  (setq gb (cdr (assoc 'group-after gdef)))
  (if (or (<= split 0) (<= axle split)) ga gb))

(defun sartd:read-data (refresh / wb sh ex row typ trailers tr ppul ppur totalAx totalPP yvals minY maxY htrailerRaw htrailerMM htrailerSrc)
  (setq wb (sartd:choose-workbook refresh))
  (if (not wb)
    nil
    (progn
      (setq sh (sartd:sheet wb sartd:*sheet-main*))
      (setq ex (sartd:sheet wb sartd:*sheet-export*))
      (if (not sh)
        nil
        (progn
          (setq trailers nil row 89 totalAx 0 totalPP 0 yvals nil)
          (while (<= row 100)
            (setq typ (vl-string-trim " \t\n\r" (sartd:cells sh (sartd:coladdr "B" row))))
            (if (/= typ "")
              (progn
                (if (not (sartd:model-supported-p typ))
                  (sartd:pr (strcat "Row " (itoa row) " trailer type '" typ "' skipped; supported in this version: K24/K2400 and K25/K2500."))
                  (progn
                    (setq ppul (sartd:yesp (sartd:cell sh (sartd:coladdr "J" row))))
                    (setq ppur (sartd:yesp (sartd:cell sh (sartd:coladdr "K" row))))
                    (setq tr
                      (list
                        (cons 'row row)
                        (cons 'type typ)
                        (cons 'axles (sartd:int (sartd:cell sh (sartd:coladdr "C" row)) 0))
                        (cons 'x (sartd:m->mm (sartd:cell sh (sartd:coladdr "E" row))))
                        (cons 'y (sartd:m->mm (sartd:cell sh (sartd:coladdr "F" row))))
                        (cons 'spacing (sartd:m->mm (sartd:cell sh (sartd:coladdr "G" row))))
                        (cons 'length (sartd:m->mm (sartd:cell sh (sartd:coladdr "H" row))))
                        (cons 'width (sartd:m->mm (sartd:cell sh (sartd:coladdr "I" row))))
                        (cons 'ppu-left ppul)
                        (cons 'ppu-right ppur)
                        (cons 'ppu-state (sartd:ppu-state ppul ppur))
                        (cons 'ppu-left-weight (sartd:num (sartd:cell sh (sartd:coladdr "L" row)) 0.0))
                        (cons 'ppu-right-weight (sartd:num (sartd:cell sh (sartd:coladdr "M" row)) 0.0))
                        (cons 'self-weight (sartd:num (sartd:cell sh (sartd:coladdr "N" row)) 0.0))))
                    (setq trailers (append trailers (list tr)))
                    (setq totalAx (+ totalAx (cdr (assoc 'axles tr))))
                    (if ppul (setq totalPP (1+ totalPP)))
                    (if ppur (setq totalPP (1+ totalPP)))
                    (setq yvals (append yvals (list (cdr (assoc 'y tr)))))))))
            (setq row (1+ row)))

          (if yvals
            (progn
              (setq minY (apply 'min yvals))
              (setq maxY (apply 'max yvals)))
            (setq minY 0.0 maxY 0.0))

          (setq htrailerRaw (sartd:named-value wb "Htrailer"))
          (if htrailerRaw
            (setq htrailerSrc "Named range Htrailer")
            (progn
              (setq htrailerRaw (sartd:cell sh "C85"))
              (setq htrailerSrc "Fallback cell C85")))
          (setq htrailerMM (sartd:m->mm htrailerRaw))

          (list
            (cons 'workbook wb)
            (cons 'sheet-main sh)
            (cons 'sheet-export ex)
            (cons 'htrailer htrailerMM)
            (cons 'htrailer-source htrailerSrc)
            (cons 'deck-height htrailerMM)
            (cons 'load-length (sartd:cellmm sh "C52"))
            (cons 'load-width  (sartd:cellmm sh "C53"))
            (cons 'load-height (sartd:cellmm sh "C56"))
            (cons 'cargo-name (sartd:cells sh "D21"))
            (cons 'cargo-weight (sartd:num (sartd:cell sh "C63") 0.0))
            (cons 'cargo-cog-x (sartd:cellmm sh "C64"))
            (cons 'cargo-cog-y (sartd:cellmm sh "C65"))
            (cons 'cargo-cog-z (sartd:cellmm sh "C66"))
            (cons 'cog-env-x (sartd:cellmm sh "E64"))
            (cons 'cog-env-y (sartd:cellmm sh "E65"))
            (cons 'packing-weight (sartd:num (sartd:cell sh "C70") 0.0))
            (cons 'packing-height (sartd:cellmm sh "C71"))
            (cons 'packing-cog-x (sartd:cellmm sh "C72"))
            (cons 'packing-cog-y (sartd:cellmm sh "C73"))
            (cons 'packing-cog-z (sartd:cellmm sh "C74"))
            ; v0.9.9.4.3.2: support / packing locations are defined by E71:E80, not only E71:E74.
            ; Matching support reactions/loads are read from F71:F80 where present.
            (cons 'support-x
                  (list (sartd:cellmm sh "E71") (sartd:cellmm sh "E72") (sartd:cellmm sh "E73") (sartd:cellmm sh "E74") (sartd:cellmm sh "E75")
                        (sartd:cellmm sh "E76") (sartd:cellmm sh "E77") (sartd:cellmm sh "E78") (sartd:cellmm sh "E79") (sartd:cellmm sh "E80")))
            (cons 'support-weight
                  (list (sartd:num (sartd:cell sh "F71") 0.0) (sartd:num (sartd:cell sh "F72") 0.0) (sartd:num (sartd:cell sh "F73") 0.0) (sartd:num (sartd:cell sh "F74") 0.0) (sartd:num (sartd:cell sh "F75") 0.0)
                        (sartd:num (sartd:cell sh "F76") 0.0) (sartd:num (sartd:cell sh "F77") 0.0) (sartd:num (sartd:cell sh "F78") 0.0) (sartd:num (sartd:cell sh "F79") 0.0) (sartd:num (sartd:cell sh "F80") 0.0)))
            (cons 'combined-weight (sartd:num (sartd:cell sh "F129") 0.0))
            (cons 'combined-cog-x (sartd:cellmm sh "G129"))
            (cons 'combined-cog-y (sartd:cellmm sh "H129"))
            (cons 'combined-cog-z (sartd:cellmm sh "I129"))
            (cons 'trailers trailers)
            (cons 'trailer-count (length trailers))
            (cons 'total-axles totalAx)
            (cons 'total-powerpacks totalPP)
            (cons 'trailer-y-min minY)
            (cons 'trailer-y-max maxY)
            (cons 'hydraulic-grouping (sartd:read-hydraulic-grouping sh trailers))
            (cons 'pinned-axles (sartd:read-pinned-axles sh))
            (cons 'export-cogx (if ex (sartd:num (sartd:cell ex "C29") 0.0) 0.0))
            (cons 'export-cogy (if ex (sartd:num (sartd:cell ex "C30") 0.0) 0.0))
            (cons 'gross-axle-line-capacity (if ex (sartd:num (sartd:cell ex "D4") 48.0) 48.0))
            (cons 'export-sheet ex)
            (cons 'longitudinal-up (sartd:num (sartd:cell sh "H291") 0.0))
            (cons 'transversal (sartd:num (sartd:cell sh "H292") 0.0))
            (cons 'vwind (sartd:num (sartd:cell sh "E353") 0.0))
            (cons 'accel-long (sartd:num (sartd:cell sh "E354") 0.0))
            (cons 'basic-tipping (sartd:num (sartd:cell sh "L503") 0.0))
            (cons 'dynamic-tipping (sartd:num (sartd:cell sh "L505") 0.0))))))))

; ----------------------------- BLOCK IMPORT / DYNAMIC PROPS -------------------------------------

(defun sartd:core-block-names (/ names gb)
  (setq names (list sartd:*block-side* sartd:*block-front* sartd:*block-top* sartd:*block-cog* sartd:*block-coordinate* sartd:*block-pinned-axle* sartd:*block-pinned-axle-plan*))
  (foreach gb sartd:*group-blocks*
    (setq names (append names (list (cdr gb)))))
  names)

(defun sartd:get-library-path (/ path)
  (cond
    ((and (setq path (getenv sartd:*library-env*)) (/= path "") (findfile path)) path)
    (T
      (princ (strcat "\nSelect " sartd:*library-default-name* " containing K24, COG, group and annotation blocks."))
      (setq path (getfiled "Select SARENS Trailer Draftsman unified block library DWG" (sartd:envstr sartd:*library-env*) "dwg" 0))
      (if path (setenv sartd:*library-env* path))
      path)))

(defun sartd:import-dwg-defs (path / space ins exploded obj marker)
  ; Loads a library DWG by inserting it as a temporary block, exploding it, then deleting
  ; the exploded references. The nested block definitions remain in the current drawing.
  (if (and path (findfile path))
    (progn
      (sartd:pr (strcat "Importing block definitions from: " path))
      (setq space (sartd:space))
      (setq ins
        (vl-catch-all-apply
          'vla-InsertBlock
          (list space (sartd:pt 999999.0 999999.0 0.0) path 1.0 1.0 1.0 0.0)))
      (if (vl-catch-all-error-p ins)
        (progn
          (sartd:pr "ActiveX insert failed while importing DWG definitions. Command-line fallback disabled to avoid command-stack crashes.")
          (setq ins nil)))
      (if ins
        (progn
          (setq exploded (vl-catch-all-apply 'vlax-invoke (list ins 'Explode)))
          (if (not (vl-catch-all-error-p exploded))
            (foreach obj exploded
              (vl-catch-all-apply 'vla-Delete (list obj))))
          (vl-catch-all-apply 'vla-Delete (list ins))
          T)
        nil))
    nil))


(defun sartd:missing-core-blocks (/ out b)
  (setq out nil)
  (foreach b (sartd:core-block-names)
    (if (not (tblsearch "BLOCK" b)) (setq out (append out (list b)))))
  out)

(defun sartd:ensure-library-defs (/ missing path)
  (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks)))
  (if missing
    (progn
      (sartd:pr "Missing one or more Trailer Draftsman library block definitions:")
      (foreach b missing (princ (strcat "\n  - " b)))
      (setq path (sartd:get-library-path))
      (if path
        (progn
          (sartd:import-dwg-defs path)
          (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks))))
        (sartd:pr "No unified block library selected."))
      (if missing
        (progn
          (sartd:pr "Still missing some library blocks. Command will continue where possible.")
          (foreach b missing (princ (strcat "\n  still missing: " b)))
          nil)
        (progn (sartd:pr "Unified block library definitions found/imported.") T)))
    T))

(defun sartd:ensure-core-blocks (/ missing)
  (sartd:ensure-library-defs)
  (setq missing (sartd:missing-core-blocks))
  (if missing
    (progn
      (sartd:pr "Still missing required model block definitions:")
      (foreach b missing (princ (strcat "\n  - " b)))
      nil)
    T))

(defun sartd:dynprops-list (br / props)
  (if (and br (vlax-method-applicable-p br 'GetDynamicBlockProperties))
    (progn
      (setq props (vl-catch-all-apply 'vlax-invoke (list br 'GetDynamicBlockProperties)))
      (cond
        ((vl-catch-all-error-p props) nil)
        ((= (type props) 'VARIANT) (vlax-safearray->list (vlax-variant-value props)))
        ((= (type props) 'SAFEARRAY) (vlax-safearray->list props))
        ((listp props) props)
        (T nil)))
    nil))

(defun sartd:dyn-allowed (prop / av vv lst)
  ; Robust allowed-values reader. Some dynamic block properties throw COM errors
  ; while their allowed values are being enumerated, so everything is guarded.
  (setq av (vl-catch-all-apply 'vlax-get-property (list prop 'AllowedValues)))
  (cond
    ((vl-catch-all-error-p av) nil)
    ((= (type av) 'VARIANT)
      (setq vv (vl-catch-all-apply 'vlax-variant-value (list av)))
      (if (or (vl-catch-all-error-p vv) (not (= (type vv) 'SAFEARRAY)))
        nil
        (progn
          (setq lst (vl-catch-all-apply 'vlax-safearray->list (list vv)))
          (if (vl-catch-all-error-p lst) nil lst))))
    ((= (type av) 'SAFEARRAY)
      (setq lst (vl-catch-all-apply 'vlax-safearray->list (list av)))
      (if (vl-catch-all-error-p lst) nil lst))
    ((listp av) av)
    (T nil)))

(defun sartd:coerce-value (old new / vt)
  (cond
    ((= (type old) 'VARIANT)
      (setq vt (vlax-variant-type old))
      (vlax-make-variant new vt))
    (T new)))

(defun sartd:set-dynprop (br propname val / props p pname old putres ok ptry oldtry)
  ; Silent, non-fatal dynamic property setter.
  ; v0.6 crashed because a missing property triggered a full dynamic-property dump
  ; during the draw loop. v0.7 never dumps during drawing; use SARTDDBG manually.
  (setq ok nil)
  (setq props (sartd:dynprops-list br))
  (if props
    (foreach p props
      (if (not ok)
        (progn
          (setq ptry (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
          (if (not (vl-catch-all-error-p ptry))
            (progn
              (setq pname ptry)
              (if (or (= (strcase pname) (strcase propname))
                      (= (sartd:norm pname) (sartd:norm propname)))
                (progn
                  (setq oldtry (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
                  (if (not (vl-catch-all-error-p oldtry))
                    (progn
                      (setq old oldtry)
                      (setq putres
                        (vl-catch-all-apply 'vlax-put-property
                          (list p 'Value (sartd:coerce-value old val))))
                      (if (not (vl-catch-all-error-p putres))
                        (setq ok T))))))))))))
  ok)

(defun sartd:set-dynprop-any (br aliases val / ok)
  ; Try several possible property names. Missing/rejected properties are not fatal.
  (setq ok nil)
  (foreach a aliases
    (if (and (not ok) (sartd:set-dynprop br a val))
      (setq ok T)))
  ok)

(defun sartd:try-ppu (br state / ok)
  (setq state (strcase (sartd:str state)))
  (setq ok (sartd:set-dynprop-any br '("PPU") state))
  (if (and (not ok) (= state "NONE"))
    (foreach s '("OFF" "NO" "FALSE" "0" "WITHOUT" "HIDDEN")
      (if (not ok) (setq ok (sartd:set-dynprop-any br '("PPU") s)))))
  ok)

; ----------------------------- v45 TRAILER MODEL / DYNAMIC BLOCK HELPERS -------------------------

(defun sartd:model-k24-p (typ / s)
  (setq s (strcase (sartd:str typ)))
  (or (wcmatch s "*K2400*") (wcmatch s "*K24*")))

(defun sartd:model-k25-p (typ / s)
  (setq s (strcase (sartd:str typ)))
  (or (wcmatch s "*K2500*") (wcmatch s "*K25*")))

(defun sartd:model-k25-h-p (typ / s)
  (setq s (strcase (sartd:str typ)))
  (and (sartd:model-k25-p s)
       (or (wcmatch s "*3000 H*")
           (wcmatch s "*3000H*")
           (wcmatch s "* K25 H*")
           (wcmatch s "*K25_H*")
           (wcmatch s "*K25-H*")
           (wcmatch s "* H"))))

(defun sartd:model-supported-p (typ)
  (or (sartd:model-k24-p typ) (sartd:model-k25-p typ)))

(defun sartd:trailer-k25-p (tr)
  (sartd:model-k25-p (cdr (assoc 'type tr))))

(defun sartd:trailer-x-pitch (tr / sp)
  ; Axle centre pitch for generated group/pinned markers.
  ; Prefer the Excel spacing value. Fallback to the old K24 constant.
  (setq sp (cdr (assoc 'spacing tr)))
  (if (and sp (> (abs sp) 1.0)) sp sartd:*k24-group-x-spacing*))

(defun sartd:trailer-row-pitch (tr / w)
  ; Row-to-row centre pitch in plan for hydraulic squares.
  ; Excel width is the complete two-file width, so row pitch is approximately width / 2.
  ; K24 old behaviour: width about 2900 -> row pitch 1450.
  (setq w (cdr (assoc 'width tr)))
  (if (and w (> (abs w) 1.0)) (/ w 2.0) sartd:*k24-group-y-spacing*))

(defun sartd:trailer-first-axle-offset (tr)
  ; First axle centre is half a pitch from the block start/reference.
  (/ (sartd:trailer-x-pitch tr) 2.0))

(defun sartd:trailer-lower-row-offset (tr)
  ; Lower row is half the row-to-row pitch below the trailer centreline.
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:v45-first-existing-block-or-import (names / b path)
  ; K25 blocks are optional to old drawings, so do a direct library import if they are not already present.
  (setq b (sartd:first-existing-block names))
  (if (not b)
    (progn
      (setq path (sartd:get-library-path))
      (if path (sartd:import-dwg-defs path))
      (setq b (sartd:first-existing-block names))))
  b)

(defun sartd:trailer-block-name (tr view / v b)
  ; Selects the correct model block for K24/K25 and the requested view.
  ; K25 uses the new W3000 dynamic assembly blocks; K24 uses the original simplified blocks.
  (setq v (strcase (sartd:str view)))
  (cond
    ((sartd:trailer-k25-p tr)
      (setq b
        (cond
          ((= v "TOP")   (sartd:v45-first-existing-block-or-import sartd:*block-k25-top-candidates*))
          ((= v "SIDE")  (sartd:v45-first-existing-block-or-import sartd:*block-k25-side-candidates*))
          ((= v "FRONT") (sartd:v45-first-existing-block-or-import sartd:*block-k25-front-candidates*))
          (T nil)))
      (if b b
        (progn
          (sartd:pr (strcat "Warning: K25 " v " block not found in library; falling back to K24 block."))
          (cond ((= v "TOP") sartd:*block-top*) ((= v "SIDE") sartd:*block-side*) ((= v "FRONT") sartd:*block-front*) (T sartd:*block-top*)))))
    ((= v "TOP") sartd:*block-top*)
    ((= v "SIDE") sartd:*block-side*)
    ((= v "FRONT") sartd:*block-front*)
    (T sartd:*block-top*)))

(defun sartd:v45-set-dynprop-candidate (br aliases candidates / props p pname ptry oldtry old allowed cand chosen avs putres)
  ; Sets a dynamic property using a list of acceptable display values.
  ; If AllowedValues exists, choose the exact matching allowed value rather than forcing a raw string.
  (setq chosen nil)
  (setq props (sartd:dynprops-list br))
  (if props
    (foreach p props
      (if (not chosen)
        (progn
          (setq ptry (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
          (if (and (not (vl-catch-all-error-p ptry))
                   (member (sartd:norm ptry) (mapcar 'sartd:norm aliases)))
            (progn
              (setq oldtry (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
              (if (not (vl-catch-all-error-p oldtry))
                (progn
                  (setq old oldtry)
                  (setq allowed (sartd:dyn-allowed p))
                  (setq avs (if allowed (mapcar 'sartd:str allowed) nil))
                  ; exact allowed-value match first
                  (if avs
                    (foreach cand candidates
                      (if (not chosen)
                        (foreach av avs
                          (if (and (not chosen) (= (sartd:norm av) (sartd:norm cand)))
                            (setq chosen av))))))
                  ; contains-match fallback for abbreviated lookup values
                  (if avs
                    (foreach cand candidates
                      (if (not chosen)
                        (foreach av avs
                          (if (and (not chosen)
                                   (or (vl-string-search (sartd:norm cand) (sartd:norm av))
                                       (vl-string-search (sartd:norm av) (sartd:norm cand))))
                            (setq chosen av))))))
                  ; no allowed-value list: try the first candidate directly
                  (if (not chosen) (setq chosen (car candidates)))
                  (if chosen
                    (progn
                      (setq putres (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value old chosen))))
                      (if (vl-catch-all-error-p putres) (setq chosen nil))))))))))))
  chosen)

(defun sartd:k25-type-candidates (tr view / s v)
  ; Maps Excel model text to the K25 dynamic block Type dropdown.
  ; K2500 3000 H  -> 2-File H
  ; K2500 3000    -> 2-File SL 0mm / standard low-frame visual
  ; K2500 3200 SL -> 2-File SL 1000mm where available
  (setq s (strcase (sartd:str (cdr (assoc 'type tr)))))
  (setq v (strcase (sartd:str view)))
  (cond
    ((= v "SIDE") '("2-File" "2 File" "2-File H" "2-File SL 0mm"))
    ((or (wcmatch s "*4*FILE*") (wcmatch s "*4-FILE*")) '("4-File" "4 File"))
    ((or (wcmatch s "*3*FILE*RIGHT*") (wcmatch s "*3-FILE*RIGHT*")) '("3-File Right" "3 File Right" "3-File"))
    ((or (wcmatch s "*3*FILE*LEFT*") (wcmatch s "*3-FILE*LEFT*")) '("3-File Left" "3 File Left" "3-File"))
    ((sartd:model-k25-h-p s) '("2-File H" "2 File H" "2-File"))
    ((or (wcmatch s "*3200*SL*") (wcmatch s "*1000*")) '("2-File SL 1000mm" "2 File SL 1000mm" "2-File SL" "2-File"))
    (T '("2-File SL 0mm" "2 File SL 0mm" "2-File SL" "2-File"))))

(defun sartd:v45-ppu-candidates (state / s)
  (setq s (strcase (sartd:str state)))
  (cond
    ((= s "LEFT")  '("PPU Left" "Powerpack Left" "Draw Bar Left" "Left" "ON"))
    ((= s "RIGHT") '("PPU Right" "Powerpack Right" "Draw Bar Right" "Right" "ON"))
    ((= s "BOTH")  '("PPU Both" "Both PPU" "PPU Left" "ON"))
    (T             '("Draw Bar" "Draw Bar Left" "OFF" "None" "No" "0"))))

(defun sartd:configure-k25-block (br tr view deck / len ax state v)
  ; Applies K25 W3000 dynamic Custom properties.
  (setq len (cdr (assoc 'length tr)))
  (setq ax (cdr (assoc 'axles tr)))
  (setq state (cdr (assoc 'ppu-state tr)))
  (setq v (strcase (sartd:str view)))
  (sartd:set-dynprop-any br '("Length" "Trailer Length" "Trailer_Length") len)
  (sartd:set-dynprop-any br '("Axle Lines" "Axles" "Axle_Lines_01") ax)
  (sartd:set-dynprop-any br '("Height" "Wheel Height" "Wheel_Hight" "Wheel_Height") deck)
  (sartd:v45-set-dynprop-candidate br '("Type") (sartd:k25-type-candidates tr v))
  (sartd:v45-set-dynprop-candidate br '("Draw Bar or PPU Left" "Draw Bar or PPU" "Draw Bar or P..." "PPU") (sartd:v45-ppu-candidates state))
  (if (= v "FRONT")
    (sartd:v45-set-dynprop-candidate br '("Draw Bar") (if (= (strcase (sartd:str state)) "NONE") '("OFF" "No" "0") '("ON" "Yes" "1"))))
  T)

(defun sartd:configure-trailer-block (br tr view deck / len ax state)
  ; Shared block configuration for all commands that draw trailer blocks.
  (if (sartd:trailer-k25-p tr)
    (sartd:configure-k25-block br tr view deck)
    (progn
      (setq len (cdr (assoc 'length tr)))
      (setq ax (cdr (assoc 'axles tr)))
      (setq state (cdr (assoc 'ppu-state tr)))
      (sartd:set-dynprop-any br '("Trailer Length" "Trailer_Length" "Length") len)
      (sartd:set-dynprop-any br '("Wheel Height" "Wheel_Hight" "Wheel_Height" "Height") deck)
      (sartd:set-dynprop-any br '("Axles" "Axle Lines" "Axle_Lines_01") ax)
      (sartd:try-ppu br state)
      T)))


(defun sartd:insert-block (name pt layer / br res)
  ; v0.9.9.4.3.12: safe insert wrapper.
  ; Some dynamic blocks/hatches can throw "Function cancelled" during an automatic workflow.
  ; Do not let one failed insert collapse the whole SARTDALL command; report it and continue.
  (if (tblsearch "BLOCK" name)
    (progn
      (setq br
        (vl-catch-all-apply
          'vla-InsertBlock
          (list (sartd:space)
                (sartd:pt (car pt) (cadr pt) (if (caddr pt) (caddr pt) 0.0))
                name 1.0 1.0 1.0 0.0)))
      (if (vl-catch-all-error-p br)
        (progn
          (sartd:pr (strcat "Insert failed/skipped for block '" name "': " (vl-catch-all-error-message br)))
          nil)
        (progn
          (vl-catch-all-apply 'vla-put-Layer (list br layer))
          (vl-catch-all-apply 'sartd:tag (list (vlax-vla-object->ename br) "BLOCK"))
          br)))
    (progn
      (sartd:pr (strcat "Block not found in drawing: " name))
      nil)))


(defun sartd:get-ground-path (/ path)
  (cond
    ((and (boundp 'sartd:*ground-path-cache*) sartd:*ground-path-cache*)
      (if (= sartd:*ground-path-cache* ":SKIP") nil sartd:*ground-path-cache*))
    ((and (setq path (getenv "SARTD_GROUND_DWG")) (/= path "") (findfile path))
      (setq sartd:*ground-path-cache* path))
    (T
      (princ "
Select SARENS_Ground_block.dwg for the ground line block. Press Cancel to use a simple CAD line for this run.")
      (setq path (getfiled "Select SARENS ground block DWG" (sartd:envstr "SARTD_GROUND_DWG") "dwg" 0))
      (if path
        (progn (setenv "SARTD_GROUND_DWG" path) (setq sartd:*ground-path-cache* path))
        (progn (setq sartd:*ground-path-cache* ":SKIP") nil)))))

(defun sartd:get-annotation-path (/ path)
  (cond
    ((and (setq path (getenv "SARTD_ANNOTATION_DWG")) (/= path "") (findfile path)) path)
    (T
      (princ "
Select SARENS_Trailer_Data_Annotation_blocks.dwg.")
      (setq path (getfiled "Select SARENS annotation block DWG" (sartd:envstr "SARTD_ANNOTATION_DWG") "dwg" 0))
      (if path (setenv "SARTD_ANNOTATION_DWG" path))
      path)))

(defun sartd:insert-dwg-reference (path pt layer sx sy / br)
  ; Inserts an external DWG as a block reference. This is used for the ground and annotation DWGs.
  (if (and path (findfile path))
    (progn
      (setq br
        (vl-catch-all-apply
          'vla-InsertBlock
          (list (sartd:space) (sartd:pt (car pt) (cadr pt) (if (caddr pt) (caddr pt) 0.0)) path (float sx) (float sy) 1.0 0.0)))
      (if (vl-catch-all-error-p br)
        (progn (sartd:pr (strcat "Could not insert DWG block reference: " path)) nil)
        (progn
          (if layer (vl-catch-all-apply 'vla-put-Layer (list br layer)))
          (sartd:tag (vlax-vla-object->ename br) "DWG-BLOCK")
          br)))
    nil))

(defun sartd:insert-ground-block (base len / path br)
  (setq path (sartd:get-ground-path))
  (if path
    (progn
      (setq br (sartd:insert-dwg-reference path base "SARTD-GROUND" 1.0 1.0))
      (if br
        (progn
          ; Try common dynamic length property names. If the ground block does not have these, nothing breaks.
          ; Use silent set calls here because simple ground blocks may not be dynamic.
          (foreach gp '("Length" "Ground Length" "Ground_Length" "Distance" "Distance1")
            (sartd:set-dynprop br gp len))
          T)
        nil))
    nil))

; ----------------------------- GEOMETRY ----------------------------------------------------------
(defun sartd:add-line (p1 p2 layer / obj)
  (setq obj
    (vl-catch-all-apply
      'vla-AddLine
      (list (sartd:space) (sartd:pt (car p1) (cadr p1) 0.0) (sartd:pt (car p2) (cadr p2) 0.0))))
  (if (vl-catch-all-error-p obj)
    (progn (sartd:pr (strcat "Line skipped: " (vl-catch-all-error-message obj))) nil)
    (progn
      (vl-catch-all-apply 'vla-put-Layer (list obj layer))
      (vl-catch-all-apply 'sartd:tag (list (vlax-vla-object->ename obj) "LINE"))
      obj)))

(defun sartd:add-circle (p r layer / obj)
  (setq obj
    (vl-catch-all-apply
      'vla-AddCircle
      (list (sartd:space) (sartd:pt (car p) (cadr p) 0.0) (float r))))
  (if (vl-catch-all-error-p obj)
    (progn (sartd:pr (strcat "Circle skipped: " (vl-catch-all-error-message obj))) nil)
    (progn
      (vl-catch-all-apply 'vla-put-Layer (list obj layer))
      (vl-catch-all-apply 'sartd:tag (list (vlax-vla-object->ename obj) "CIRCLE"))
      obj)))

(defun sartd:add-text (txt p h layer / obj)
  (setq obj
    (vl-catch-all-apply
      'vla-AddText
      (list (sartd:space) (sartd:str txt) (sartd:pt (car p) (cadr p) 0.0) (float h))))
  (if (vl-catch-all-error-p obj)
    (progn (sartd:pr (strcat "Text skipped: " (vl-catch-all-error-message obj))) nil)
    (progn
      (vl-catch-all-apply 'vla-put-Layer (list obj layer))
      (vl-catch-all-apply 'sartd:tag (list (vlax-vla-object->ename obj) "TEXT"))
      obj)))

(defun sartd:add-lwpoly (pts layer closed / coords arr pl)
  (setq coords (apply 'append (mapcar '(lambda (p) (list (float (car p)) (float (cadr p)))) pts)))
  (setq arr (vlax-make-safearray vlax-vbDouble (cons 0 (1- (length coords)))))
  (vlax-safearray-fill arr coords)
  (setq pl (vl-catch-all-apply 'vla-AddLightWeightPolyline (list (sartd:space) arr)))
  (if (vl-catch-all-error-p pl)
    (progn (sartd:pr (strcat "Polyline skipped: " (vl-catch-all-error-message pl))) nil)
    (progn
      (vl-catch-all-apply 'vla-put-Closed (list pl (if closed :vlax-true :vlax-false)))
      (vl-catch-all-apply 'vla-put-Layer (list pl layer))
      (vl-catch-all-apply 'sartd:tag (list (vlax-vla-object->ename pl) "POLY"))
      pl)))

(defun sartd:add-rect (x1 y1 x2 y2 layer)
  (sartd:add-lwpoly (list (list x1 y1) (list x2 y1) (list x2 y2) (list x1 y2)) layer T))

(defun sartd:dim-text (txt p h / obj)
  (sartd:add-text txt p h sartd:*layer-dim*))


(defun sartd:dim-override-text (txt / s tstr eqpos brpos n)
  ; v0.9.9.4.3.5: keep dimension measurements live.
  ; Any written numerical value in the override is replaced with <> so AutoCAD displays
  ; the actual measured dimension. Prefix text such as "Load Height =" is preserved.
  (setq s (vl-string-trim " \t\n\r" (sartd:str txt)))
  (cond
    ((or (null s) (= s "")) "")
    ((= s "<>") "<>")
    ((vl-string-search "=" s)
      (setq eqpos (vl-string-search "=" s))
      (strcat (substr s 1 (1+ eqpos)) " <>"))
    ((vl-string-search "[" s)
      (setq brpos (vl-string-search "[" s))
      (strcat "<> " (substr s (1+ brpos))))
    ((distof (sartd:clean-numstr s) 2) "<>")
    (T s)))


(defun sartd:add-linear-dim (p1 p2 loc rot txt / obj)
  ; Uses native AutoCAD rotated/linear dimension objects, not drafted lines.
  ; rot = 0 for horizontal, pi/2 for vertical.
  (setq obj
    (vl-catch-all-apply
      'vla-AddDimRotated
      (list (sartd:space)
            (sartd:pt (car p1) (cadr p1) 0.0)
            (sartd:pt (car p2) (cadr p2) 0.0)
            (sartd:pt (car loc) (cadr loc) 0.0)
            (float rot))))
  (if (vl-catch-all-error-p obj)
    (progn
      (sartd:pr "Could not add AutoCAD linear dimension; falling back to simple dimension text.")
      (sartd:dim-text txt loc 220.0)
      nil)
    (progn
      (vla-put-Layer obj sartd:*layer-dim*)
      (if (and txt (/= (sartd:str txt) ""))
        (vl-catch-all-apply 'vla-put-TextOverride (list obj (sartd:dim-override-text txt))))
      (sartd:tag (vlax-vla-object->ename obj) "DIM")
      obj)))

(defun sartd:set-dim-style (obj style / doc styles st res)
  (if (and obj style (/= style ""))
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq styles (vla-get-DimStyles doc))
      (setq st (vl-catch-all-apply 'vla-Item (list styles style)))
      (if (not (vl-catch-all-error-p st))
        (progn
          (vl-catch-all-apply 'vlax-put-property (list obj 'StyleName style))
          (vl-catch-all-apply 'vla-Update (list obj))
          T)
        nil))
    nil))

(defun sartd:add-linear-dim-style (p1 p2 loc rot txt style / obj)
  (setq obj (sartd:add-linear-dim p1 p2 loc rot txt))
  (if obj (sartd:set-dim-style obj style))
  obj)

(defun sartd:apply-dim-tolerance (obj upper lower / u l)
  ; Applies upper/lower tolerance properties where AutoCAD exposes them.
  ; v0.9.5: do not write the tolerance into TextOverride. The dimension text stays as <>
  ; and AutoCAD's tolerance properties display the + / - values.
  (if obj
    (progn
      (setq u (max 0.0 (sartd:num upper 0.0)))
      (setq l (max 0.0 (sartd:num lower 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextOverride "<>"))
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceDisplay 2))
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceUpperLimit u))
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceLowerLimit l))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TolerancePrecision 0))
      (vl-catch-all-apply 'vla-Update (list obj)))))


(defun sartd:scale-int (v / n)
  ; v0.9.9.4.3.17: normalise a scale denominator.
  ; Bad/tiny values fall back to 1:200. Very large values are limited to 1:5000
  ; because that is the largest scale in the internal SARTD scale list.
  (setq n (fix (+ 0.5 (abs (sartd:num v sartd:*default-callout-scale*)))))
  (if (< n 1) (setq n (fix sartd:*default-callout-scale*)))
  (if (> n 5000) (setq n 5000))
  n)

(defun sartd:current-view-scale (/ v out)
  (setq v (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0))
  (setq out
    (if (<= v 0.0)
      (if (and (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale*) sartd:*last-viewport-scale* sartd:*default-callout-scale*)
      v))
  (sartd:scale-int out))

(defun sartd:auto-dim-gap (/ sc)
  ; v0.9.7 scale-aware spacing rule:
  ; 1:200 -> 700mm, 1:400 -> 1400mm, therefore gap = 3.5 * scale.
  (setq sc (sartd:current-view-scale))
  (max sartd:*dim-gap-min* (* 3.5 sc)))

(defun sartd:auto-title-clearance (/ sc)
  (setq sc (sartd:current-view-scale))
  (max sartd:*dim-title-clearance-min* (* 8.0 sc)))

(defun sartd:draw-dim-v-between (xref xdim y1 y2 txt / obj)
  ; Vertical dim with extension lines reaching from the dimension line back to the real reference X.
  (setq obj (sartd:add-linear-dim-style (list xref y1) (list xref y2) (list xdim (/ (+ y1 y2) 2.0)) (/ pi 2.0) txt sartd:*dimstyle-standard*))
  obj)

(defun sartd:draw-dim-v-between-refs (xref1 xref2 xdim y1 y2 txt / obj)
  ; Vertical dimension where each extension line can stop at its own real reference X.
  ; Used for plan-view trailer CTC dims so extension lines stop at the middle of the PPU/train end.
  (setq obj (sartd:add-linear-dim-style (list xref1 y1) (list xref2 y2) (list xdim (/ (+ y1 y2) 2.0)) (/ pi 2.0) txt sartd:*dimstyle-standard*))
  obj)

(defun sartd:plan-left-ref-x-for-trailer (tr planBase / x len ppu ppuLen)
  ; Reference X for the plan-view trailer CTC dimension extension line.
  ; v0.9.9.4.3.5: the extension line goes to the most-left part of the PPU/train end,
  ; while the Y reference remains the trailer centreline. This stops the line crossing the PPU/trailer.
  (setq x (cdr (assoc 'x tr)))
  (setq len (cdr (assoc 'length tr)))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen 4300.0)
  (cond
    ((or (= ppu "LEFT") (= ppu "BOTH")) (+ (car planBase) (- x ppuLen)))
    (T (+ (car planBase) x))))

(defun sartd:draw-dim-h-between (yref ydim x1 x2 txt / obj)
  ; Horizontal dim with extension lines reaching from the dimension line back to the real reference Y.
  (setq obj (sartd:add-linear-dim-style (list x1 yref) (list x2 yref) (list (/ (+ x1 x2) 2.0) ydim) 0.0 txt sartd:*dimstyle-standard*))
  obj)

(defun sartd:draw-dim-h (x1 x2 y off txt / yy)
  ; Standard dimensions: all normal dimensions use SAR_DIM on layer Dim - 01.
  ; COG-to-origin dimensions use sartd:draw-ref-dim-h/v instead.
  (setq yy (+ y off))
  (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 txt sartd:*dimstyle-standard*))

(defun sartd:draw-dim-v (x y1 y2 off txt / xx)
  ; Standard dimensions: all normal dimensions use SAR_DIM on layer Dim - 01.
  (setq xx (+ x off))
  (sartd:add-linear-dim-style (list x y1) (list x y2) (list xx (/ (+ y1 y2) 2.0)) (/ pi 2.0) txt sartd:*dimstyle-standard*))

(defun sartd:draw-ref-dim-h (x1 x2 y off txt / yy)
  ; Reference dimensions only: used for COG-to-origin offsets.
  (setq yy (+ y off))
  (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 txt sartd:*dimstyle-reference*))

(defun sartd:draw-ref-dim-v (x y1 y2 off txt / xx)
  ; Reference dimensions only: used for COG-to-origin offsets.
  (setq xx (+ x off))
  (sartd:add-linear-dim-style (list x y1) (list x y2) (list xx (/ (+ y1 y2) 2.0)) (/ pi 2.0) txt sartd:*dimstyle-reference*))

(defun sartd:draw-dim-h-style (x1 x2 y off txt style / yy)
  (setq yy (+ y off))
  (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 txt style))

(defun sartd:draw-dim-v-style (x y1 y2 off txt style / xx)
  (setq xx (+ x off))
  (sartd:add-linear-dim-style (list x y1) (list x y2) (list xx (/ (+ y1 y2) 2.0)) (/ pi 2.0) txt style))

(defun sartd:sortnums (lst)
  (vl-sort lst '<))

(defun sartd:trailer-ppu-left-edge (tr / x len ppu ppuLen)
  ; Returns the leftmost X of the visible equipment for this trailer, including a PPU if present.
  (setq x (cdr (assoc 'x tr)))
  (setq len (cdr (assoc 'length tr)))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen 4300.0)
  (cond
    ((= ppu "LEFT") (- x ppuLen))
    ((= ppu "RIGHT") x)
    ((= ppu "BOTH") (- x ppuLen))
    (T x)))

(defun sartd:trailer-ppu-right-edge (tr / x len ppu ppuLen)
  ; Returns the rightmost X of the visible equipment for this trailer, including a right-hand PPU if present.
  (setq x (cdr (assoc 'x tr)))
  (setq len (cdr (assoc 'length tr)))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen 4300.0)
  (cond
    ((= ppu "RIGHT") (+ x len ppuLen))
    ((= ppu "BOTH") (+ x len ppuLen))
    (T (+ x len))))

(defun sartd:draw-plan-trailer-spacing-dims (data planBase / trailers sorted W x lastY lastRef pair y refX txt minEquipX refs)
  ; Left side vertical dimensions showing load edge to trailer centrelines and trailer centre-to-centre gaps.
  ; v0.9.9.4.2: extension lines stop at the middle of each PPU, or at the train/trailer end where no left PPU exists.
  (setq trailers (sartd:g 'trailers data))
  (setq W (sartd:g 'load-width data))
  (setq minEquipX
    (if trailers
      (apply 'min (mapcar '(lambda (tr) (+ (car planBase) (sartd:trailer-ppu-left-edge tr))) trailers))
      (car planBase)))
  (setq x (- minEquipX 700.0))
  (setq refs
    (mapcar
      '(lambda (tr) (list (cdr (assoc 'y tr)) (sartd:plan-left-ref-x-for-trailer tr planBase)))
      trailers))
  (setq sorted (vl-sort refs '(lambda (a b) (< (car a) (car b)))))
  (if sorted
    (progn
      (setq lastY 0.0)
      (setq lastRef (cadr (car sorted)))
      (foreach pair sorted
        (setq y (car pair))
        (setq refX (cadr pair))
        (setq txt (sartd:fmt0 (- y lastY)))
        (if (> (abs (- y lastY)) 1.0)
          (sartd:draw-dim-v-between-refs lastRef refX x (+ (cadr planBase) lastY) (+ (cadr planBase) y) txt))
        (setq lastY y)
        (setq lastRef refX))
      (if (> (abs (- W lastY)) 1.0)
        (sartd:draw-dim-v-between-refs lastRef lastRef x (+ (cadr planBase) lastY) (+ (cadr planBase) W) (sartd:fmt0 (- W lastY)))))))

(defun sartd:draw-plan-support-spacing-dims (data planBase / L supportX pts last p y)
  ; Bottom chain dimensions showing packing/support centre positions from the Excel support table.
  (setq L (sartd:g 'load-length data))
  (setq supportX (vl-remove-if '(lambda (v) (<= (sartd:num v 0.0) 0.0)) (sartd:g 'support-x data)))
  (setq supportX (sartd:sortnums supportX))
  (setq pts (append (list 0.0) supportX (list L)))
  (setq y (- (cadr planBase) (* 1.7 (sartd:auto-dim-gap))))
  (setq last (car pts))
  (foreach p (cdr pts)
    (if (> (abs (- p last)) 1.0)
      (sartd:draw-dim-h (+ (car planBase) last) (+ (car planBase) p) (cadr planBase) (- y (cadr planBase)) (sartd:fmt0 (- p last))))
    (setq last p)))

(defun sartd:draw-cog-origin-dims (origin cog mode / ox oy cx cy hloc vloc)
  ; Adds X/Y, X/Z or Y/Z reference dimensions from the coordinate origin block to the cargo COG.
  ; v0.9.5: dimension extension lines use the real origin point and the real COG point,
  ; so they extend all the way to the COG block rather than stopping on the origin axes only.
  (setq ox (car origin) oy (cadr origin) cx (car cog) cy (cadr cog))
  (setq hloc (list (/ (+ ox cx) 2.0) (- (min oy cy) (sartd:auto-dim-gap))))
  (setq vloc (list (- (min ox cx) (sartd:auto-dim-gap)) (/ (+ oy cy) 2.0)))
  (sartd:add-linear-dim-style (list ox oy) (list cx cy) hloc 0.0 (sartd:fmt0 (abs (- cx ox))) sartd:*dimstyle-reference*)
  (sartd:add-linear-dim-style (list ox oy) (list cx cy) vloc (/ pi 2.0) (sartd:fmt0 (abs (- cy oy))) sartd:*dimstyle-reference*))

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp overallStart overallEnd dimObj deckX deckUpper deckLower minY maxY trWidth endLeft endRight gap topOff lower1 lower2 sideDimX sideDimX2 endTopOff transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight)
  ; v0.9.6: dimensions use scale-aware offsets to avoid overlap at larger viewport scales.
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq ppuLen 4300.0)
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq overallStart (+ (car sideBase) trX (- ppuLen)))
  (setq overallEnd (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  ; v0.9.9.4.2: transport width dim is placed 700mm beyond the visible trailer/PPU end.
  (setq maxTrailerRight
    (if trailers
      (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers))
      L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: top load length, lower PPU/trailer/overall length.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (sartd:draw-dim-h-style overallStart (+ (car sideBase) trX) (cadr sideBase) lower1
                         (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*)
  (sartd:draw-dim-h-style (+ (car sideBase) trX) (+ (car sideBase) trX trLen) (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") sartd:*dimstyle-k24-axle*)
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; Side view vertical dimensions are placed beyond the end of the geometry and spaced out.
  (setq sideDimX (+ (car sideBase) (max L (+ trX trLen)) 700.0))
  (setq sideDimX2 (+ sideDimX gap))
  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list sideDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list sideDimX2 (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height with tolerance against K24 1250-1750 range.
  ; v0.9.9: deck height dimension is aligned with the side-view load-height dimension stack.
  ; The transport height dimension uses the same upper/lower tolerance because the trailer ride height changes the transport height by the same amount.
  (setq deckX sideDimX)
  (setq deckUpper (- sartd:*k24-deck-max* deck))
  (setq deckLower (- deck sartd:*k24-deck-min*))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  ; Right-side height stack: load height inside, transport height outside.
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))

(defun sartd:set-single-attribute (br tag value / atts a count)
  (setq count 0)
  (if (and br (= :vlax-true (vla-get-HasAttributes br)))
    (progn
      (setq atts (vlax-invoke br 'GetAttributes))
      (foreach a atts
        (if (= (sartd:norm (vlax-get-property a 'TagString)) (sartd:norm tag))
          (progn
            (vlax-put-property a 'TextString (sartd:str value))
            (setq count (1+ count)))))))
  count)

(defun sartd:draw-cog (x y label weight / r text br)
  ; v0.8.4: use the official Sarens COG block if available.
  (setq text
    (cond
      ((= (sartd:norm label) "CARGOCOG")
        (strcat "Cargo C.o.G = " (rtos (sartd:num weight 0.0) 2 1) " Te"))
      ((= (sartd:norm label) "COMBINEDCOG")
        (strcat "Combined C.o.G = " (rtos (sartd:num weight 0.0) 2 1) " Te"))
      (T (strcat label " = " (rtos (sartd:num weight 0.0) 2 1) " Te"))))
  (if (tblsearch "BLOCK" sartd:*block-cog*)
    (progn
      (setq br (sartd:insert-block sartd:*block-cog* (list x y 0.0) sartd:*layer-cog*))
      (if br
        (progn
          (sartd:tag (vlax-vla-object->ename br) "COG")
          ; v0.9.9.4.2: the COG block is kept at XYZ scale 1 and uses its custom Scale property.
          (sartd:putprop-safe br 'XScaleFactor 1.0)
          (sartd:putprop-safe br 'YScaleFactor 1.0)
          (sartd:putprop-safe br 'ZScaleFactor 1.0)
          (sartd:set-dynprop-any br '("Scale" "Drawing Scale" "Drawing_Scale") (sartd:ground-scale-string))
          (sartd:set-single-attribute br "ITEM" text)))
      br)
    (progn
      ; Fallback if the unified block library has not been imported.
      (setq r 150.0)
      (sartd:add-circle (list x y) r sartd:*layer-cog*)
      (sartd:add-line (list (- x (* 1.5 r)) y) (list (+ x (* 1.5 r)) y) sartd:*layer-cog*)
      (sartd:add-line (list x (- y (* 1.5 r))) (list x (+ y (* 1.5 r))) sartd:*layer-cog*)
      (sartd:add-text text (list (+ x 220.0) (+ y 220.0)) 220.0 "2"))))


(defun sartd:first-existing-block (names / found n)
  (setq found nil)
  (foreach n names
    (if (and (not found) (tblsearch "BLOCK" n)) (setq found n)))
  found)

(defun sartd:ground-block-name ()
  (sartd:first-existing-block sartd:*ground-block-candidates*))

(defun sartd:ground-scale-string (/ sc)
  (setq sc (fix (+ 0.5 (sartd:current-view-scale))))
  (if (<= sc 0) (setq sc sartd:*default-callout-scale*))
  (strcat "1/" (itoa sc)))

(defun sartd:set-ground-dynamic-props (br len / okLen)
  ; v0.9.9: the Sarens ground block must keep normal XYZ scale at 1.
  ; Its own custom dynamic properties drive drawing scale and horizontal length.
  (if br
    (progn
      (sartd:putprop-safe br 'XScaleFactor 1.0)
      (sartd:putprop-safe br 'YScaleFactor 1.0)
      (sartd:putprop-safe br 'ZScaleFactor 1.0)
      (sartd:set-dynprop-any br '("Scale" "Drawing Scale" "Drawing_Scale") (sartd:ground-scale-string))
      (setq okLen (sartd:set-dynprop-any br '("Length_Horizontal" "Horizontal Length" "Horizontal_Length" "Length" "Ground Length" "Ground_Length" "Distance" "Distance1" "Distance2") len))
      okLen)))

(defun sartd:draw-ground-block-range (x1 x2 y label / name len br)
  ; v0.9.9: use the official ground block from the unified library.
  ; The block reference remains on layer 0 with XYZ scale = 1.
  ; Scale is set through its custom dynamic property, and length through Length_Horizontal.
  (setq name (sartd:ground-block-name))
  (setq len (abs (- x2 x1)))
  (if name
    (progn
      (setq br (sartd:insert-block name (list x1 y 0.0) "0"))
      (if br
        (progn
          (sartd:tag (vlax-vla-object->ename br) "GROUND_BLOCK")
          (sartd:set-ground-dynamic-props br len)
          br)
        nil))
    nil))

(defun sartd:draw-ground (base len label / y obj)
  (setq y (cadr base))
  (if (not (sartd:draw-ground-block-range (car base) (+ (car base) len) y label))
    (progn
      (setq obj (sartd:add-line (list (car base) y) (list (+ (car base) len) y) "SARTD-GROUND"))
      (if obj (sartd:tag (vlax-vla-object->ename obj) "GROUND")))))

(defun sartd:draw-ground-range (x1 x2 y label / obj)
  ; v0.9.6: prefer official ground block; fall back to a line only if the block is not present.
  (if (not (sartd:draw-ground-block-range x1 x2 y label))
    (progn
      (sartd:pr "Ground block not found in unified library; using fallback CAD line for ground.")
      (setq obj (sartd:add-line (list x1 y) (list x2 y) "SARTD-GROUND"))
      (if obj (sartd:tag (vlax-vla-object->ename obj) "GROUND")))))

(defun sartd:draw-view-label (label x1 x2 y / obj)
  (setq obj (sartd:add-text label (list (/ (+ x1 x2) 2.0) y) 350.0 "2"))
  (if obj
    (progn
      (vl-catch-all-apply 'vlax-put-property (list obj 'Alignment 1))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextAlignmentPoint (sartd:pt (/ (+ x1 x2) 2.0) y 0.0)))
      (sartd:tag (vlax-vla-object->ename obj) "VIEW_LABEL")))
  obj)

(defun sartd:draw-coordinate-symbol (pt visibility / br)
  (if (tblsearch "BLOCK" sartd:*block-coordinate*)
    (progn
      (setq br (sartd:insert-block sartd:*block-coordinate* pt "2"))
      (if br
        (progn
          (sartd:set-dynprop-any br '("Visibility1" "Visibility" "Visibility State") visibility)
          (sartd:tag (vlax-vla-object->ename br) "COORDINATE")
          (sartd:putprop-safe br 'XScaleFactor sartd:*default-callout-scale*)
          (sartd:putprop-safe br 'YScaleFactor sartd:*default-callout-scale*)
          (sartd:putprop-safe br 'ZScaleFactor sartd:*default-callout-scale*)
          (vl-catch-all-apply 'vla-Update (list br))))
      br)
    (progn
      (sartd:add-text visibility pt 250.0 "2")
      nil)))

(defun sartd:save-base (base)
  (setenv "SARTD_BASE_X" (rtos (car base) 2 8))
  (setenv "SARTD_BASE_Y" (rtos (cadr base) 2 8))
  T)

(defun sartd:last-base (/ x y)
  (setq x (getenv "SARTD_BASE_X"))
  (setq y (getenv "SARTD_BASE_Y"))
  (if (and x y (/= x "") (/= y ""))
    (list (atof x) (atof y) 0.0)
    nil))

(defun sartd:save-extents (ll ur)
  (if (and ll ur)
    (progn
      (setenv "SARTD_EXT_MIN_X" (rtos (car ll) 2 8))
      (setenv "SARTD_EXT_MIN_Y" (rtos (cadr ll) 2 8))
      (setenv "SARTD_EXT_MAX_X" (rtos (car ur) 2 8))
      (setenv "SARTD_EXT_MAX_Y" (rtos (cadr ur) 2 8))
      (setq sartd:*last-extents* (list ll ur))))
  T)

(defun sartd:last-extents (/ minx miny maxx maxy)
  (cond
    ((and (boundp 'sartd:*last-extents*) sartd:*last-extents*) sartd:*last-extents*)
    (T
      (setq minx (getenv "SARTD_EXT_MIN_X"))
      (setq miny (getenv "SARTD_EXT_MIN_Y"))
      (setq maxx (getenv "SARTD_EXT_MAX_X"))
      (setq maxy (getenv "SARTD_EXT_MAX_Y"))
      (if (and minx miny maxx maxy (/= minx "") (/= miny "") (/= maxx "") (/= maxy ""))
        (setq sartd:*last-extents* (list (list (atof minx) (atof miny)) (list (atof maxx) (atof maxy))))
        nil))))


(defun sartd:generated-model-extents (/ ss i ent obj role ok minpt maxpt pmin pmax minx miny maxx maxy got)
  ; v0.9.9.4.3.12: calculate real extents from generated ModelSpace objects.
  ; This is more reliable than the earlier hand-built extents and prevents the viewport
  ; centring on an oversized/offset imaginary box.
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0 got nil)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        ; Exclude paper-space generated viewport/annotation entities; fit only to model drawing objects.
        (setq ok (and (/= role "VIEWPORT") (/= role "ANNOTATION") (= (strcase (sartd:str (cdr (assoc 410 (entget ent))))) "MODEL")))
        (if ok
          (progn
            (setq obj (vlax-ename->vla-object ent))
            (setq pmin nil pmax nil)
            (setq ok (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'pmin 'pmax)))
            (if (not (vl-catch-all-error-p ok))
              (progn
                (setq minpt (vlax-safearray->list pmin))
                (setq maxpt (vlax-safearray->list pmax))
                (if (not got)
                  (progn
                    (setq minx (car minpt) miny (cadr minpt) maxx (car maxpt) maxy (cadr maxpt) got T)
                  (progn
                    (setq minx (min minx (car minpt)))
                    (setq miny (min miny (cadr minpt)))
                    (setq maxx (max maxx (car maxpt)))
                    (setq maxy (max maxy (cadr maxpt)))))))))
        (setq i (1+ i)))
      (if got
        (list (list minx miny) (list maxx maxy))
        nil))
    nil)))

(defun sartd:refresh-generated-extents (/ ext pad sc)
  ; v0.9.9.4.3.12: safe mode.
  ; Earlier v0.9.9.4.3.10 used GetBoundingBox on every generated object to derive true extents.
  ; On some Sarens dynamic blocks / associative hatch objects this can trigger heavy regens and AutoCAD
  ; may report "Function cancelled" during the automatic workflow. The draw routine already saves
  ; calculated extents from the known view geometry, so this function now leaves those extents in place.
  ; This keeps SARTDALL stable and avoids object-bounding-box regen crashes.
  (sartd:last-extents))

(defun sartd:delete-old-viewports (/ ss i ent)
  ; Only delete viewports created by this tool. Do not wipe the whole Defpoints layer.
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (if (= (strcase (sartd:str (sartd:xdata-role ent))) "VIEWPORT")
          (entdel ent))
        (setq i (1+ i))))))

(defun sartd:putprop-safe (obj prop val)
  (vl-catch-all-apply 'vlax-put-property (list obj prop val)))

(defun sartd:scale-generated-dims (scale / ss i ent obj role)
  ; v0.9.9.4.2: dimensions are scaled ONLY with the AutoCAD property
  ; "Dim scale overall". In ActiveX this is exposed as ScaleFactor on dimension objects.
  ; Do not force TextHeight, ArrowheadSize, DIMTXT, DIMASZ, etc.; the dim style controls those.
  (setq scale (sartd:scale-int scale))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(0 . "DIMENSION") (cons 8 sartd:*layer-dim*)))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (if (= role "DIM")
          (progn
            (setq obj (vlax-ename->vla-object ent))
            (sartd:putprop-safe obj 'ScaleFactor (float scale))
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "Dimension Scale Overall set to 1:" (itoa scale) " for generated dimensions.")))


(defun sartd:scale-generated-callouts (scale / ss i ent obj role hText hView)
  ; v0.9.8: scale model-space callout blocks AND generated text to suit the selected viewport scale.
  ; Group square blocks are NOT scaled because they represent the real axle grouping layout.
  ; Ground blocks keep reference XYZ scale = 1 and use their custom Scale/Length_Horizontal properties.
  (setq scale (sartd:scale-int scale))
  (setq hText (* 2.0 (float scale)))
  (setq hView (* 2.0 (float scale)))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq obj (vlax-ename->vla-object ent))
        (cond
          ((= role "COG")
            ; COG block scales like the ground block: XYZ stays 1, custom Scale changes.
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (sartd:set-dynprop-any obj '("Scale" "Drawing Scale" "Drawing_Scale") (strcat "1/" (itoa scale)))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "COORDINATE")
            (sartd:putprop-safe obj 'XScaleFactor (float scale))
            (sartd:putprop-safe obj 'YScaleFactor (float scale))
            (sartd:putprop-safe obj 'ZScaleFactor (float scale))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "PINNED_AXLE")
            ; v0.9.9.2: side-view pinned axle block SV_K24_Pinned_Axle must never be drawing-scale scaled.
            ; Keep the reference at 1:1 in XYZ so the block geometry/wipeout stays exactly as authored.
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "GROUND_BLOCK")
            ; Ground block uses custom Scale, not reference XYZ scale.
            ; Keep XYZ as 1 and set the custom Scale property to match the viewport.
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (sartd:set-dynprop-any obj '("Scale" "Drawing Scale" "Drawing_Scale") (strcat "1/" (itoa scale)))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "VIEW_LABEL")
            (sartd:putprop-safe obj 'Height hView)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "TEXT")
            (sartd:putprop-safe obj 'Height hText)
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "Model-space callouts/text scaled for viewport scale 1:" (itoa scale) ".")))

(defun sartd:choose-scale (ratio / scales out s target maxScale)
  ; ratio is required model-units per paper-unit.
  ; v0.9.9.4.3.21: use the expanded internal SARTD scale list.
  ; Logic is the same as manually zooming extents inside the viewport first,
  ; then snapping to the next standard scale denominator that still fits.
  (setq scales sartd:*standard-scale-denominators*)
  (setq target (max 1.0 (sartd:num ratio 200.0)))
  (setq maxScale (last scales))
  (setq out (if maxScale (car maxScale) 5000))
  (foreach s scales
    (if (and (= out (if maxScale (car maxScale) 5000)) (>= (float s) target))
      (setq out s)))
  (sartd:scale-int out))

(defun sartd:create-paper-viewport (modelLL modelUR / doc ps mw mh p1 p2 x1 y1 x2 y2 pw ph pcx pcy ratio scale vp ent midx midy ans oldcv oldcmdecho)
  ; v0.8.3.7: create the viewport using AutoCAD MVIEW, not AddPViewport.
  ; This makes a normal editable paper-space viewport rectangle created the same way as a user-drawn MVIEW.
  ; The routine then centres it on the generated model views and applies a standard scale.
  (initget "Draw Skip")
  (setq ans (getkword "\nPaper-space viewport using MVIEW [Draw new/Skip] <Draw>: "))
  (if (null ans) (setq ans "Draw"))
  (if (= ans "Skip")
    (sartd:pr "Viewport creation skipped.")
    (progn
      (sartd:go-paperspace)
      (sartd:pr "Switched fully to PaperSpace. Draw the MVIEW viewport rectangle on the layout sheet.")
      (setq p1 (getpoint "\nPick first corner of MVIEW viewport: "))
      (if p1
        (setq p2 (getcorner p1 "\nPick opposite corner of MVIEW viewport: ")))
      (if (not (and p1 p2))
        (sartd:pr "No viewport rectangle selected.")
        (progn
          (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
          (setq ps (vla-get-PaperSpace doc))
          (setq x1 (min (car p1) (car p2)))
          (setq x2 (max (car p1) (car p2)))
          (setq y1 (min (cadr p1) (cadr p2)))
          (setq y2 (max (cadr p1) (cadr p2)))
          (setq pw (abs (- x2 x1)))
          (setq ph (abs (- y2 y1)))
          (if (or (< pw 5.0) (< ph 5.0))
            (sartd:pr "Viewport rectangle too small.")
            (progn
              (setq mw (abs (- (car modelUR) (car modelLL))))
              (setq mh (abs (- (cadr modelUR) (cadr modelLL))))
              (setq ratio (max (/ mw pw) (/ mh ph)))
              (setq scale (sartd:choose-scale ratio))
              (setq pcx (/ (+ x1 x2) 2.0))
              (setq pcy (/ (+ y1 y2) 2.0))
              (setq midx (/ (+ (car modelLL) (car modelUR)) 2.0))
              (setq midy (/ (+ (cadr modelLL) (cadr modelUR)) 2.0))
              (sartd:delete-old-viewports)

              ; Draw a real paper-space viewport using MVIEW.
              ; Avoid vl-catch-all-apply around COMMAND, which caused earlier "bad order function" crashes.
              (setq oldcmdecho (getvar "CMDECHO"))
              (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
              (setq oldcv (getvar "CVPORT"))
              (vl-catch-all-apply 'vl-cmdf (list "_.PSPACE"))
              (vl-cmdf "_.MVIEW" (list x1 y1 0.0) (list x2 y2 0.0))
              (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))

              (setq ent (entlast))
              (if (not ent)
                (sartd:pr "MVIEW did not return a viewport object.")
                (progn
                  (setq vp (vlax-ename->vla-object ent))
                  (if (/= (strcase (vla-get-ObjectName vp)) "ACDBVIEWPORT")
                    (sartd:pr "Last created object was not a viewport. Check MVIEW command output.")
                    (progn
                      (vla-put-Layer vp sartd:*layer-viewport*)
                      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
                      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
                      ; At 1:scale, paper height ph shows ph*scale model units.
                      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
                      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
                      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
                      ; Lock display scale/pan but the paper-space viewport frame can still be grip-resized.
                      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
                      (sartd:tag ent "VIEWPORT")
                      (setq sartd:*last-viewport-scale* scale)
                      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
                      (sartd:scale-generated-dims scale)
                      (sartd:scale-generated-callouts scale)
                      (vl-catch-all-apply 'vla-Update (list vp))
                      (sartd:go-paperspace)
                      (sartd:pr (strcat "MVIEW viewport created on Defpoints at standard scale 1:" (itoa scale) ".")))))))))))))


(defun sartd:group-block-name (grp)
  (cdr (assoc grp sartd:*group-blocks*)))

(defun sartd:group-average-point (pts / sx sy n p)
  (setq sx 0.0 sy 0.0 n 0)
  (foreach p pts
    (setq sx (+ sx (car p)))
    (setq sy (+ sy (cadr p)))
    (setq n (1+ n)))
  (if (> n 0) (list (/ sx n) (/ sy n)) nil))

(defun sartd:group-centres-from-map (gmap / out item pt)
  (setq out nil)
  (foreach item gmap
    (setq pt (sartd:group-average-point (cdr item)))
    (if pt (setq out (append out (list (cons (car item) pt))))))
  out)

(defun sartd:gmap-add (gmap grp pt / item)
  (setq item (assoc grp gmap))
  (if item
    (subst (cons grp (append (cdr item) (list pt))) item gmap)
    (append gmap (list (cons grp (list pt))))))

(defun sartd:draw-hydraulic-triangle (gmap / centres p1 p2 p3 pl)
  ; Draw a closed red polyline through the centre of the Group 1/2/3 hydraulic areas.
  (setq centres (sartd:group-centres-from-map gmap))
  (setq p1 (cdr (assoc 1 centres)))
  (setq p2 (cdr (assoc 2 centres)))
  (setq p3 (cdr (assoc 3 centres)))
  (if (and p1 p2 p3)
    (progn
      (setq pl (sartd:add-lwpoly (list p1 p2 p3) "SARTD-HYD-TRI" T))
      (if pl
        (progn
          (vl-catch-all-apply 'vla-put-Color (list pl 1))
          (vl-catch-all-apply 'vla-put-Lineweight (list pl 30))))
      (sartd:pr "Hydraulic stability triangle drawn."))
    (sartd:pr "Hydraulic stability triangle skipped: Groups 1, 2 and 3 are not all present.")))

(defun sartd:draw-side-pinned-axles (data sideBase / trailers rows row idx pins tr ax xPitch trX x y br drawn blk deck r)
  ; v53: side-view pinned axle blocks follow the live trailer deck height.
  ; K25 H uses 1175mm, K25 SL uses 1250mm, K24 uses the workbook Htrailer/deck-height.
  (setq rows (sartd:g 'pinned-axles data))
  (setq trailers (sartd:g 'trailers data))
  (setq drawn 0)
  (cond
    ((not rows) nil)
    ((not trailers) nil)
    (T
      (setq idx 1)
      (foreach tr trailers
        (setq row nil)
        (foreach r rows
          (if (= (cdr (assoc 'trailer-index r)) idx)
            (setq row r)))
        (if row
          (progn
            (setq pins (cdr (assoc 'pins row)))
            (setq trX (cdr (assoc 'x tr)))
            (setq xPitch (sartd:trailer-x-pitch tr))
            (setq deck (sartd:v53-trailer-deck-height tr data))
            (setq blk (sartd:v53-side-pinned-block-name tr))
            (if blk
              (foreach ax pins
                (if (and (> ax 0) (<= ax (cdr (assoc 'axles tr))))
                  (progn
                    ; X uses the same axle pitch/first-axle logic as the plan markers.
                    ; Y is now the trailer deck height rather than the old fixed 656mm.
                    (setq x (+ (car sideBase) trX (sartd:trailer-first-axle-offset tr) (* (1- ax) xPitch) sartd:*k24-pinned-marker-x-offset-from-axle*))
                    (setq y (+ (cadr sideBase) deck))
                    (setq br (sartd:insert-block blk (list x y 0.0) "0"))
                    (if br
                      (progn
                        (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_SIDE")
                        (sartd:v53-configure-pinned-block br tr data "SIDE")
                        (setq drawn (1+ drawn)))))))
              (sartd:pr "No side-view pinned axle block found; pinned side markers skipped."))))
        (setq idx (1+ idx)))
      (if (> drawn 0)
        (sartd:pr (strcat "Side-view pinned axle markers inserted/aligned to trailer deck height: " (itoa drawn) "."))))))

(defun sartd:draw-hydraulic-groups (data planBase / trailers hdefs tr idx hds hd ax axCount xPitch yPitch x0 y0 x y grp b br gmap sideName skippedPins planPinnedDrawn planPinnedMissing)
  ; v0.8.6.1: insert Sarens group square blocks centred directly on the K24 axle-centre crosses.
  ; K24 group square centres are fixed at 1400mm c/c in X and 1450mm c/c in Y.
  ; The trailer row X/Y from Excel is treated as the first lower axle-centre cross reference.
  (setq trailers (sartd:g 'trailers data))
  (setq hdefs (sartd:g 'hydraulic-grouping data))
  (setq idx 1)
  (setq skippedPins 0)
  (setq planPinnedDrawn 0)
  (setq planPinnedMissing 0)
  (setq gmap nil)
  (foreach tr trailers
    (setq hds nil)
    (foreach hd hdefs
      (if (= (cdr (assoc 'trailer-index hd)) idx)
        (setq hds (append hds (list hd)))))
    (setq axCount (cdr (assoc 'axles tr)))
    ; v45: axle/group marker positions follow the trailer row geometry.
    ; X pitch comes from Excel spacing. Y row pitch is derived from trailer width so K24 and K25 both align.
    (setq xPitch (sartd:trailer-x-pitch tr))
    (setq yPitch (sartd:trailer-row-pitch tr))
    (setq x0 (+ (car planBase) (cdr (assoc 'x tr)) (sartd:trailer-first-axle-offset tr)))
    (setq y0 (+ (cadr planBase) (cdr (assoc 'y tr)) (sartd:trailer-lower-row-offset tr)))
    (foreach hd hds
      (setq ax 1)
      (while (<= ax axCount)
        (if (sartd:axle-pinned-p data idx ax)
          ; Pinned axle lines are intentionally closed off. They do not receive hydraulic group squares
          ; and they do not contribute to the hydraulic stability triangle.
          ; v0.9.9.1: in plan view, replace the missing group square with the top-view pinned axle block.
          (progn
            (setq skippedPins (1+ skippedPins))
            (setq x (+ x0 (* (1- ax) xPitch)))
            (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
            (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))
            (if (tblsearch "BLOCK" sartd:*block-pinned-axle-plan*)
              (progn
                (setq br (sartd:insert-block sartd:*block-pinned-axle-plan* (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_PLAN")
                    (setq planPinnedDrawn (1+ planPinnedDrawn)))))
              (setq planPinnedMissing (1+ planPinnedMissing))))
          (progn
            (setq grp (sartd:hyd-group-at-axle hd ax))
            (setq b (sartd:group-block-name grp))
            (if (and b (tblsearch "BLOCK" b))
              (progn
                ; Place square centre directly on the K24 axle-centre cross.
                ; Axle 1 = first lower row cross, then +1400mm in X. Top row is +1450mm in Y.
                (setq x (+ x0 (* (1- ax) xPitch)))
                (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
                (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))
                (setq br (sartd:insert-block b (list x y 0.0) "SARTD-HYD-GROUP"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) (strcat "HYD_GROUP_" (itoa grp)))
                    (setq gmap (sartd:gmap-add gmap grp (list x y)))))))))
        (setq ax (1+ ax))))
    (setq idx (1+ idx)))
  (if gmap (sartd:draw-hydraulic-triangle gmap))
  (if (or gmap (> planPinnedDrawn 0))
    (progn
      (if gmap
        (sartd:pr "Hydraulic group squares drawn from Excel grouping table using trailer spacing/width geometry."))
      (if (> skippedPins 0)
        (sartd:pr (strcat "Pinned / closed-off axle positions skipped from hydraulic groups and stability triangle: " (itoa skippedPins))))
      (if (> planPinnedDrawn 0)
        (sartd:pr (strcat "Top-view pinned axle blocks inserted in place of plan group squares: " (itoa planPinnedDrawn))))
      (if (> planPinnedMissing 0)
        (sartd:pr "TV_K24_Pinned_Axle block not found; pinned plan markers were skipped.")))
    (sartd:pr "No hydraulic group squares drawn. Check grouping rows 138 onwards and group block names.")))


(defun sartd:find-paper-viewports (objs / out obj)
  (setq out nil)
  (foreach obj objs
    (if (and obj (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBVIEWPORT"))
      (setq out (append out (list obj)))))
  out)

(defun sartd:largest-viewport (vps / best bestArea vp w h area)
  (setq best nil bestArea -1.0)
  (foreach vp vps
    (setq w (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
    (setq h (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
    (setq area (* w h))
    (if (> area bestArea) (setq best vp bestArea area)))
  best)

(defun sartd:fit-existing-viewport (vp modelLL modelUR / pw ph mw mh ratio scale midx midy)
  (if vp
    (progn
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (if (or (<= pw 0.0) (<= ph 0.0))
        (sartd:pr "Copied viewport has invalid width/height; scale not applied.")
        (progn
          (setq mw (abs (- (car modelUR) (car modelLL))))
          (setq mh (abs (- (cadr modelUR) (cadr modelLL))))
          ; Raw fit scale is the programmatic equivalent of manually opening the viewport
          ; and zooming extents. Add a small margin, then snap to the nearest standard scale
          ; that still fits the raw extents.
          (setq ratio (* 1.05 (max (/ mw pw) (/ mh ph))))
          (setq scale (sartd:choose-scale ratio))
          (setq midx (/ (+ (car modelLL) (car modelUR)) 2.0))
          (setq midy (/ (+ (cadr modelLL) (cadr modelUR)) 2.0))
          (vla-put-Layer vp sartd:*layer-viewport*)
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
          (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:scale-generated-dims scale)
          (sartd:scale-generated-callouts scale)
          (vl-catch-all-apply 'vla-Update (list vp))
          (sartd:pr (strcat "PaperSpace template viewport centred at standard scale 1:" (itoa scale) ".")))))))


(defun sartd:fit-existing-viewport-at-scale (vp modelLL modelUR scale / ph midx midy)
  ; v0.9.8: force an imported sheet viewport to a chosen scale, defaulting to 1:200.
  ; This is used by SARTDP so the official sheet comes in at a predictable starting scale.
  (if vp
    (progn
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (if (<= ph 0.0)
        (sartd:pr "Copied viewport has invalid height; scale not applied.")
        (progn
          (setq midx (/ (+ (car modelLL) (car modelUR)) 2.0))
          (setq midy (/ (+ (cadr modelLL) (cadr modelUR)) 2.0))
          (vla-put-Layer vp sartd:*layer-viewport*)
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
          (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:scale-generated-dims scale)
          (sartd:scale-generated-callouts scale)
          (vl-catch-all-apply 'vla-Update (list vp))
          (sartd:pr (strcat "PaperSpace viewport centred at default scale 1:" (itoa scale) ".")))))))

(defun sartd:layout-paper-viewports (layoutName / doc layouts lay blk out obj res)
  ; Reads viewport objects from a named PaperSpace layout without needing the user to be on that tab.
  (setq out nil)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layouts (vla-get-Layouts doc))
  (if (and layoutName (/= (sartd:str layoutName) ""))
    (progn
      (setq lay (vl-catch-all-apply 'vla-Item (list layouts layoutName)))
      (if (not (vl-catch-all-error-p lay))
        (progn
          (setq blk (vl-catch-all-apply 'vla-get-Block (list lay)))
          (if (not (vl-catch-all-error-p blk))
            (vlax-for obj blk
              (if (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBVIEWPORT")
                (setq out (append out (list obj))))))))))
  out)

(defun sartd:viewport-scale-from-object (vp / cs sc)
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (if (> cs 0.0)
    (progn
      (setq sc (fix (+ 0.5 (/ 1.0 cs))))
      (sartd:scale-int sc))
    (sartd:scale-int sartd:*default-callout-scale*)))

(defun sartd:sheet-viewport-scale (/ lname vps vp sc)
  ; Gets the active/last PaperSpace viewport scale. Falls back to SARTD_LAST_VIEWPORT_SCALE then 1:200.
  (setq lname (getenv "SARTD_LAST_LAYOUT"))
  (setq vps nil)
  (if (and lname (/= lname "")) (setq vps (sartd:layout-paper-viewports lname)))
  (if (not vps)
    (if (= (getvar "TILEMODE") 0) (setq vps (sartd:current-layout-paper-viewports))))
  (if vps
    (progn
      (setq vp (sartd:largest-viewport vps))
      (setq sc (sartd:viewport-scale-from-object vp)))
    (setq sc (sartd:current-view-scale)))
  (setq sartd:*last-viewport-scale* sc)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa sc))
  sc)

(defun sartd:get-bbox-min (objs / minx miny obj mn mx mnlst mxlst ok)
  (setq minx nil miny nil)
  (foreach obj objs
    (setq ok (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'mn 'mx)))
    (if (not (vl-catch-all-error-p ok))
      (progn
        (setq mnlst (vlax-safearray->list mn))
        (if (or (not minx) (< (car mnlst) minx)) (setq minx (car mnlst)))
        (if (or (not miny) (< (cadr mnlst) miny)) (setq miny (cadr mnlst))))))
  (if (and minx miny) (list minx miny) (list 0.0 0.0)))

(defun sartd:objectdbx-doc (/ acad obj try ver)
  (setq acad (vlax-get-acad-object))
  (setq obj nil)
  (foreach ver '(30 29 28 27 26 25 24 23 22 21 20 19 18 17 16)
    (if (not obj)
      (progn
        (setq try (vl-catch-all-apply 'vla-GetInterfaceObject (list acad (strcat "ObjectDBX.AxDbDocument." (itoa ver)))))
        (if (not (vl-catch-all-error-p try)) (setq obj try)))))
  (if (not obj)
    (progn
      (setq try (vl-catch-all-apply 'vla-GetInterfaceObject (list acad "ObjectDBX.AxDbDocument")))
      (if (not (vl-catch-all-error-p try)) (setq obj try))))
  obj)

(defun sartd:copy-library-paperspace-template (base modelLL modelUR / path dbx doc srcps dstps lst arr i copied copiedList minpt dx dy obj vp vps amap data)
  ; Copies all PaperSpace entities from the unified library DWG, moves them to the picked bottom-left,
  ; then fits the largest copied viewport to the generated ModelSpace arrangement.
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn (sartd:pr "No unified library DWG found; PaperSpace template copy skipped.") nil)
    (progn
      (setq dbx (sartd:objectdbx-doc))
      (if (not dbx)
        (progn (sartd:pr "ObjectDBX is not available; cannot copy PaperSpace template from library in this AutoCAD session.") nil)
        (progn
          (if (vl-catch-all-error-p (vl-catch-all-apply 'vla-Open (list dbx path)))
            (progn (sartd:pr "Could not open unified library DWG using ObjectDBX.") nil)
            (progn
              (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
              (setq srcps (vla-get-PaperSpace dbx))
              (setq dstps (vla-get-PaperSpace doc))
              (setq lst nil)
              (vlax-for obj srcps
                ; skip the default paper-space viewport if present and tiny/off-sheet? Keep all for now; use largest later.
                (setq lst (append lst (list obj))))
              (if (not lst)
                (progn (sartd:pr "Unified library PaperSpace contains no copyable objects.") nil)
                (progn
                  (setq arr (vlax-make-safearray vlax-vbObject (cons 0 (1- (length lst)))))
                  (setq i 0)
                  (foreach obj lst
                    (vlax-safearray-put-element arr i obj)
                    (setq i (1+ i)))
                  (setq copied (vl-catch-all-apply 'vla-CopyObjects (list dbx arr dstps)))
                  (if (vl-catch-all-error-p copied)
                    (progn (sartd:pr (strcat "PaperSpace copy failed: " (vl-catch-all-error-message copied))) nil)
                    (progn
                      (setq copiedList (sartd:to-list copied))
                      (setq minpt (sartd:get-bbox-min copiedList))
                      (setq dx (- (car base) (car minpt)))
                      (setq dy (- (cadr base) (cadr minpt)))
                      (foreach obj copiedList
                        (vl-catch-all-apply 'vla-Move (list obj (sartd:pt 0.0 0.0 0.0) (sartd:pt dx dy 0.0))))
                      (setq vps (sartd:find-paper-viewports copiedList))
                      (setq vp (sartd:largest-viewport vps))
                      (if vp (sartd:fit-existing-viewport vp modelLL modelUR) (sartd:pr "No viewport found in copied PaperSpace template."))
                      (sartd:pr "Unified PaperSpace template copied from library.")
                      copiedList)))))))))))


(defun sartd:layout-names-current (/ doc layouts out lay)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layouts (vla-get-Layouts doc))
  (setq out nil)
  (vlax-for lay layouts
    (setq out (append out (list (vla-get-Name lay)))))
  out)

(defun sartd:layout-name-exists-p (name names / found n)
  (setq found nil)
  (foreach n names
    (if (= (strcase (sartd:str n)) (strcase (sartd:str name)))
      (setq found T)))
  found)

(defun sartd:layout-name-diff (after before / out n)
  (setq out nil)
  (foreach n after
    (if (not (sartd:layout-name-exists-p n before))
      (setq out (append out (list n)))))
  out)

(defun sartd:library-paper-layout-names (/ path dbx layouts out lay nm openres)
  ; Reads the layout names contained in the unified DWG without copying/pasting entities.
  (setq path (sartd:get-library-path))
  (setq out nil)
  (if (and path (findfile path))
    (progn
      (setq dbx (sartd:objectdbx-doc))
      (if dbx
        (progn
          (setq openres (vl-catch-all-apply 'vla-Open (list dbx path)))
          (if (not (vl-catch-all-error-p openres))
            (progn
              (setq layouts (vla-get-Layouts dbx))
              (vlax-for lay layouts
                (setq nm (vla-get-Name lay))
                (if (/= (strcase nm) "MODEL")
                  (setq out (append out (list nm)))))))))))
  out)

(defun sartd:first-library-paper-layout (/ names)
  (setq names (sartd:library-paper-layout-names))
  (if names (car names) nil))

(defun sartd:current-layout-paper-viewports (/ ps out obj)
  (setq out nil)
  (setq ps (sartd:paperspace))
  (vlax-for obj ps
    (if (and obj (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBVIEWPORT"))
      (setq out (append out (list obj)))))
  out)

(defun sartd:import-library-layout (/ path layout before after added target oldcmdecho res tryNames nm found msg)
  ; v0.9.4: import the exact paper-space layout/sheet from the unified block library DWG.
  ; Do NOT rely on ObjectDBX layout-name reading only, because some AutoCAD/ObjectDBX sessions
  ; return no paper layouts even when the DWG contains them. The robust method is:
  ;   - try to read a paper layout name;
  ;   - if none is found, import ALL paper layouts using * via -LAYOUT Template;
  ;   - pick the newly-created layout tab.
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn (sartd:pr "No unified block library DWG found for layout import.") nil)
    (progn
      ; Do not call PSPACE/go-paperspace before importing. -LAYOUT Template is allowed from Model tab.
      (setq before (sartd:layout-names-current))
      (setq layout (sartd:first-library-paper-layout))
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (cond
        (layout
          (sartd:pr (strcat "Importing official layout '" layout "' from unified block library."))
          ;; v0.9.9.4.3.12: no FBOUNDP in AutoLISP here; use VL-CMDF directly.
          (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path layout))))
        (T
          (sartd:pr "Could not read library layout names through ObjectDBX; importing all PaperSpace layouts from the library instead.")
          ; In -LAYOUT Template, * imports all layouts from the selected DWG template.
          (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path "*")))))
      (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
      (if (vl-catch-all-error-p res)
        (progn (sartd:pr (strcat "Layout import command failed: " (vl-catch-all-error-message res))) nil)
        (progn
          (setq after (sartd:layout-names-current))
          (setq added (sartd:layout-name-diff after before))
          (cond
            (added (setq target (car added)))
            ((and layout (sartd:layout-name-exists-p layout after)) (setq target layout))
            (T (setq target nil)))
          (if (not target)
            (progn
              (sartd:pr "Layout import ran, but no new PaperSpace layout tab was detected.")
              (sartd:pr "Check that the block library DWG has a saved PaperSpace layout tab, not only paper objects in ModelSpace.")
              nil)
            (progn
              (setenv "SARTD_LAST_LAYOUT" target)
              (sartd:activate-paper-layout target)
              (sartd:pr (strcat "Official PaperSpace sheet imported as layout: " target))
              target)))))))

(defun sartd:fit-current-layout-viewport (modelLL modelUR / vps vp)
  (setq vps (sartd:current-layout-paper-viewports))
  (setq vp (sartd:largest-viewport vps))
  (if vp
    (sartd:fit-existing-viewport vp modelLL modelUR)
    (sartd:pr "No PaperSpace viewport found on imported official sheet.")))

(defun sartd:fit-current-layout-viewport-default (modelLL modelUR / vps vp)
  ; v0.9.8: SARTDP imports the official layout and sets the viewport to 1:200 by default.
  (setq vps (sartd:current-layout-paper-viewports))
  (setq vp (sartd:largest-viewport vps))
  (if vp
    (sartd:fit-existing-viewport-at-scale vp modelLL modelUR 200)
    (sartd:pr "No PaperSpace viewport found on imported official sheet.")))

(defun sartd:update-all-paperspace-annotations (data / amap ps obj total)
  (sartd:go-paperspace)
  (setq amap (sartd:attr-map data))
  (setq ps (sartd:paperspace))
  (setq total 0)
  (vlax-for obj ps
    (if (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBBLOCKREFERENCE")
      (setq total (+ total (sartd:set-block-attributes obj amap)))))
  (sartd:pr (strcat "Updated " (itoa total) " PaperSpace annotation/border attribute(s).")))

(defun sartd:block-effective-name (obj / r)
  (setq r (vl-catch-all-apply 'vlax-get-property (list obj 'EffectiveName)))
  (if (vl-catch-all-error-p r)
    (setq r (vl-catch-all-apply 'vlax-get-property (list obj 'Name))))
  (if (vl-catch-all-error-p r) "" (sartd:str r)))

(defun sartd:update-border-attributes (data / amap ps obj total nm)
  ; v0.9.9.4.3.3: update the imported official Sarens border/title block.
  (sartd:go-paperspace)
  (setq amap (sartd:attr-map data))
  (setq ps (sartd:paperspace))
  (setq total 0)
  (vlax-for obj ps
    (if (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBBLOCKREFERENCE")
      (progn
        (setq nm (strcase (sartd:block-effective-name obj)))
        (if (= nm "SAR_BORDER_PROJECT")
          (setq total (+ total (sartd:set-block-attributes obj amap)))))))
  (if (> total 0)
    (sartd:pr (strcat "Updated Sarens border/title block attributes: " (itoa total) "."))
    (sartd:pr "No SAR_Border_Project block found on the current PaperSpace layout."))
  total)

(defun sartd:run-border-update (/ data)
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq data (sartd:read-data T))
  (if data (sartd:update-border-attributes data))
  (sartd:go-paperspace)
  (princ))



(defun sartd:clamp (v lo hi)
  (max lo (min hi v)))

(defun sartd:auto-view-gap-x (data / sc)
  ; v0.9.9.4.3.15: scale-based side-to-end gap trial values.
  ; 1:100 -> 2000mm, 1:150 -> 2500mm, 1:200 -> 3000mm,
  ; 1:250 -> 3750mm, 1:300 -> 4500mm, 1:400 -> 6000mm.
  ; The actual END VIEW placement also adds the side-view dimension zone before this gap.
  (setq sc (sartd:current-view-scale))
  (cond
    ((<= sc 100) 2000.0)
    ((<= sc 150) 2500.0)
    ((<= sc 200) 3000.0)
    ((<= sc 250) 3750.0)
    ((<= sc 300) 4500.0)
    (T 6000.0)))

(defun sartd:auto-view-clear-y (data / sc)
  ; v0.9.9.4.3.15: scale-based side-to-plan vertical gap trial values.
  ; 1:100 -> 2500mm, 1:150 -> 3000mm, 1:200 -> 3500mm,
  ; 1:250 -> 4375mm, 1:300 -> 5250mm, 1:400 -> 7000mm.
  (setq sc (sartd:current-view-scale))
  (cond
    ((<= sc 100) 2500.0)
    ((<= sc 150) 3000.0)
    ((<= sc 200) 3500.0)
    ((<= sc 250) 4375.0)
    ((<= sc 300) 5250.0)
    (T 7000.0)))

(defun sartd:auto-viewport-from-current-layout (/ vps vp)
  ; Returns the only viewport, or the largest viewport if the sheet has more than one.
  (setq vps (sartd:current-layout-paper-viewports))
  (cond
    ((null vps) nil)
    ((= (length vps) 1) (car vps))
    (T (sartd:largest-viewport vps))))

(defun sartd:auto-redraw-spaced-at-scale (scale / oldauto oldspace oldautospace data base oldScale oldEnv)
  ; Internal stage used by SARTDAUTOFIT.
  ; Redraws the model arrangement at the saved base point using compact auto-spacing and the chosen drawing scale.
  (vl-load-com)
  (setq scale (sartd:scale-int scale))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldspace (if (boundp 'sartd:*space-override*) sartd:*space-override* nil))
  (setq oldautospace (if (boundp 'sartd:*auto-spacing-active*) sartd:*auto-spacing-active* nil))
  (setq oldScale (if (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale* nil))
  (setq oldEnv (getenv "SARTD_LAST_VIEWPORT_SCALE"))
  (setq sartd:*auto-excel-source* "Active")
  (setq sartd:*last-viewport-scale* scale)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
  (setq data (sartd:read-data T))
  (if data
    (progn
      (setq base (sartd:last-base))
      (if (not base) (setq base (list 0.0 0.0 0.0)))
      (sartd:save-base base)
      (sartd:setup-layers)
      (sartd:go-modelspace)
      (sartd:delete-generated)
      (setq sartd:*auto-spacing-active* T)
      (setq sartd:*space-override* (sartd:modelspace))
      (sartd:draw-arrangement data base)
      (sartd:scale-generated-dims scale)
      (sartd:scale-generated-callouts scale)
      ; Scaling dimensions/text changes the real bounding box, so refresh extents afterwards.
      (sartd:refresh-generated-extents)
      (sartd:pr (strcat "Auto-spaced model views redrawn for scale 1:" (itoa scale) "."))))
  (setq sartd:*auto-excel-source* oldauto)
  (setq sartd:*space-override* oldspace)
  (setq sartd:*auto-spacing-active* oldautospace)
  data)

(defun sartd:run-autofit (/ vp ext initialScale fittedScale data target)
  ; v0.9.9.4.3.12: PaperSpace command with auto layout activation.
  ; If called by SARTDALL straight after SARTDP, it activates the imported layout first,
  ; then finds the sheet viewport and performs the auto-space/fit/scale pass.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    ((/= (getvar "CVPORT") 1)
      (progn
        (vl-catch-all-apply 'vla-put-MSpace (list (vla-get-ActiveDocument (vlax-get-acad-object)) :vlax-false))
        (if (/= (getvar "CVPORT") 1)
          (sartd:pr "SARTDAUTOFIT is still inside a floating viewport. Click PaperSpace/PSPACE once, then retry.")
          (sartd:run-autofit))))
    (T
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          ; First pass uses current/default viewport scale to make readable dims and sensible extents.
          (setq data (sartd:auto-redraw-spaced-at-scale initialScale))
          (setq ext (sartd:last-extents))
          (if (not ext)
            (sartd:pr "No generated model extents found after auto-spacing.")
            (progn
              (sartd:activate-paper-layout target)
              (sartd:fit-existing-viewport vp (car ext) (cadr ext))
              (setq fittedScale (sartd:viewport-scale-from-object vp))
              (if (< fittedScale 10) (setq fittedScale sartd:*default-callout-scale*))
              ; Second pass redraws dims/text spacing for the actual chosen viewport scale, then refits once more.
              (if (/= (sartd:scale-int fittedScale) (sartd:scale-int initialScale))
                (progn
                  (sartd:auto-redraw-spaced-at-scale fittedScale)
                  (setq ext (sartd:last-extents))
                  (sartd:activate-paper-layout target)
                  (sartd:fit-existing-viewport vp (car ext) (cadr ext)))
                (progn
                  (sartd:scale-generated-dims fittedScale)
                  (sartd:scale-generated-callouts fittedScale)
                  (sartd:refresh-generated-extents)
                  (setq ext (sartd:last-extents))
                  (sartd:activate-paper-layout target)
                  (sartd:fit-existing-viewport vp (car ext) (cadr ext))))
              (sartd:activate-paper-layout target)
              (sartd:pr "Auto-fit complete: views spaced, viewport centred/scaled, generated callouts rescaled.")))))))
  (princ))


(defun sartd:safe-stage (label fn / r)
  ; Run an internal stage without allowing an AutoCAD/COM error to collapse the command stack.
  ; Returns T on success, nil on failure/cancel.
  (setq r (vl-catch-all-apply fn '()))
  (if (vl-catch-all-error-p r)
    (progn
      (sartd:pr (strcat label " failed: " (vl-catch-all-error-message r)))
      nil)
    T))

(defun sartd:setvar-safe (name val / r)
  (setq r (vl-catch-all-apply 'setvar (list name val)))
  (not (vl-catch-all-error-p r)))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  ; v0.9.9.4.3.12: alternative one-shot workflow made more robust.
  ; The automatic workflow now avoids the object-bounding-box refresh that caused function-cancelled
  ; errors, runs each stage safely, and only continues when the previous stage completes.
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL smart auto-fit uses the internal SARTD standard scale list and sets viewport CustomScale directly."))
  (sartd:pr "Auto workflow 2 started: draw model, import sheet, auto-space/fit viewport, update border.")

  (setq ok (sartd:safe-stage "Auto model draw" 'sartd:run-model-auto-0))
  (if ok (setq ok (sartd:safe-stage "PaperSpace sheet import" 'sartd:run-paper-auto-active)))
  (if ok
    (progn
      (if (not (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT")))
        (sartd:pr "Auto workflow 2 could not activate the imported PaperSpace layout before AutoFit."))
      (setq ok (sartd:safe-stage "AutoFit" 'sartd:run-autofit))))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Border update" 'sartd:run-border-auto-active))))

  (sartd:setvar-safe "REGENAUTO" 1)
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))

(defun sartd:draw-arrangement (data base / L W H deck pack loadBot loadTop planBase sideBase endBase
                                      maxLen maxY minY viewGapX viewGapY trailers tr br x y len wid ax sp ppu
                                      sideTr frontBr supportX supportW sx ex envx envy cx cy cz ccx ccy ccz endWidth
                                      trCount distance clearGap firstTr brand cargoWt combWt frontX frontTr ppuLen trX trLen
                                      groundStart groundEnd trWidth endGroundStart endGroundEnd endLeft endRight coordPlan coordSide coordEnd sideLeft sideRight planTopAllowance
                                      gap topOff lower2 sideDimX2 endDimX2 maxTrailerRight minEquipLeft extMinX extMinY extMaxX extMaxY)
  (sartd:ensure-core-blocks)

  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq trailers (sartd:g 'trailers data))
  (setq trCount (length trailers))
  (setq minY (sartd:g 'trailer-y-min data))
  (setq maxY (sartd:g 'trailer-y-max data))
  (setq distance (- maxY minY))
  (if (< distance 0.0) (setq distance 0.0))
  (setq clearGap (- distance (if trailers (cdr (assoc 'width (car trailers))) 0.0)))
  (if (< clearGap 0.0) (setq clearGap 0.0))

  (setq maxLen (max L (if trailers (apply 'max (mapcar '(lambda (xx) (cdr (assoc 'length xx))) trailers)) L)))
  (setq endWidth (max W (+ clearGap (if trailers (cdr (assoc 'width (car trailers))) 0.0))))
  (setq viewGapY sartd:*view-gap-y*)
  (setq viewGapX sartd:*view-gap-x*)

  ; v0.9.0 Sarens layout: SIDE and END above, PLAN below.
  ; The picked base point remains the PLAN view Excel/load 0,0 origin.
  (setq planBase base)
  ; Real side-view horizontal extents relative to the load origin, including PPU positions.
  (setq sideLeft (min 0.0 (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0)))
  (setq sideRight (max L (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L)))
  (if (and (boundp 'sartd:*auto-spacing-active*) sartd:*auto-spacing-active*)
    (progn
      ; v0.9.9.4.3.12: compact auto-spacing mode.
      ; Keep SIDE above the complete PLAN view, allowing room for plan dimensions and title.
      (setq viewGapX (sartd:auto-view-gap-x data))
      (setq viewGapY (sartd:auto-view-clear-y data))
      (setq planTopAllowance (+ W (sartd:auto-title-clearance) (* 2.0 (sartd:auto-dim-gap))))
      ; The SIDE view has bottom length dimensions below its ground line.
      ; Include that dim zone before placing the SIDE view above the PLAN view.
      (setq sideBase (list (car base) (+ (cadr base) planTopAllowance (* 3.4 (sartd:auto-dim-gap)) viewGapY) 0.0)))
    (setq sideBase (list (car base) (+ (cadr base) loadTop viewGapY) 0.0)))
  ; v0.9.9.4.3.15: Place END view from the full SIDE view occupied zone, not only side geometry.
  ; This includes the right-side vertical dimension stack so the END view cannot overlap side dims.
  (setq endBase  (list (+ (car sideBase) sideRight 700.0 (* 2.2 (sartd:auto-dim-gap)) viewGapX) (cadr sideBase) 0.0))

  ; View labels sit clear of top dimensions. Side and end share horizontal level; side and plan share centreline.
  (sartd:draw-view-label "SIDE VIEW" (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "END VIEW"  (car endBase)  (+ (car endBase) W) (+ (cadr endBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "PLAN VIEW" (car planBase) (+ (car planBase) L) (+ (cadr planBase) W (sartd:auto-title-clearance)))

  ; ---- trailer TOP / PLAN blocks, one per trailer row.
  ; v46: if the Excel axle count is above the dynamic block limit, split the visible train into
  ; sequential block segments so long 66-axle lines still draw correctly.
  (foreach tr trailers
    (sartd:draw-trailer-blocks-split tr "TOP" planBase deck))

  ; ---- hydraulic group blocks in plan view and hydraulic stability triangle
  (sartd:draw-hydraulic-groups data planBase)

  (sartd:pr "Stage: side-view trailer block...")
  ; ---- side block: first trailer only to avoid duplicate overlap in side view.
  ; v46: split visually into chained dynamic blocks if axle count exceeds the block limit.
  (if trailers
    (progn
      (setq firstTr (car trailers))
      (sartd:draw-trailer-blocks-split firstTr "SIDE" sideBase deck)))

  (sartd:pr "Stage: side-view pinned axle markers...")
  ; ---- pinned axle markers on side view
  (sartd:draw-side-pinned-axles data sideBase)

  (sartd:pr "Stage: end-view trailer blocks...")
  ; ---- front/end blocks: one FRONT block per Excel trailer row.
  (foreach frontTr trailers
    (setq frontX (+ (car endBase) (cdr (assoc 'y frontTr))))
    (setq frontBr (sartd:insert-block (sartd:trailer-block-name frontTr "FRONT") (list frontX (+ (cadr endBase) deck) 0.0) "0"))
    (if frontBr
      (progn
        (sartd:configure-trailer-block frontBr frontTr "FRONT" deck)
        (sartd:tag (vlax-vla-object->ename frontBr) "TRAILER_BLOCK"))))

  (sartd:pr "Stage: ground blocks...")
  ; ---- ground lines fixed at Z=0, with Sarens 250mm overrun.
  ; v62: use the real visible side-view equipment extents, including left/right PPUs.
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq groundStart (+ (car sideBase) (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0) (- sartd:*ground-overrun*)))
  (setq groundEnd   (+ (car sideBase) (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen) sartd:*ground-overrun*))
  (sartd:draw-ground-range groundStart groundEnd (cadr sideBase) "GROUND / Z=0")
  (setq trWidth (if firstTr (cdr (assoc 'width firstTr)) 0.0))
  (setq endGroundStart (+ (car endBase) minY (- (/ trWidth 2.0)) (- sartd:*ground-overrun*)))
  (setq endGroundEnd   (+ (car endBase) maxY (/ trWidth 2.0) sartd:*ground-overrun*))
  (sartd:draw-ground-range endGroundStart endGroundEnd (cadr endBase) "GROUND / Z=0")

  (sartd:pr "Stage: load outline...")
  ; ---- load outline
  ; Plan: X/Y
  (sartd:add-rect (car planBase) (cadr planBase) (+ (car planBase) L) (+ (cadr planBase) W) sartd:*layer-load*)
  ; Side: X/Z
  (sartd:add-rect (car sideBase) (+ (cadr sideBase) loadBot) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) sartd:*layer-load*)
  ; End: Y/Z
  (sartd:add-rect (car endBase) (+ (cadr endBase) loadBot) (+ (car endBase) W) (+ (cadr endBase) loadTop) sartd:*layer-load*)

  (sartd:pr "Stage: packing/supports...")
  ; ---- packing/supports. Draw simple 400mm wide supports at valid E71:E80 positions.
  (setq supportX (sartd:g 'support-x data))
  (setq supportW 400.0)
  (foreach sx supportX
    (if (> sx 0.0)
      (progn
        ; plan support across load width
        (sartd:add-rect (+ (car planBase) sx (- (/ supportW 2.0))) (cadr planBase)
                        (+ (car planBase) sx (/ supportW 2.0)) (+ (cadr planBase) W) "SARTD-PACKING")
        ; side support from deck to deck + packing height
        (sartd:add-rect (+ (car sideBase) sx (- (/ supportW 2.0))) (+ (cadr sideBase) deck)
                        (+ (car sideBase) sx (/ supportW 2.0)) (+ (cadr sideBase) loadBot) "SARTD-PACKING"))))
  ; end packing line/block
  (sartd:add-rect (car endBase) (+ (cadr endBase) deck) (+ (car endBase) W) (+ (cadr endBase) loadBot) "SARTD-PACKING")

  (sartd:pr "Stage: COG and datum blocks...")
  ; ---- COG markers
  (setq cx (sartd:g 'cargo-cog-x data))
  (setq cy (sartd:g 'cargo-cog-y data))
  (setq cz (+ loadBot (sartd:g 'cargo-cog-z data)))
  (setq ccx (sartd:g 'combined-cog-x data))
  (setq ccy (sartd:g 'combined-cog-y data))
  (setq ccz (sartd:g 'combined-cog-z data))
  (setq cargoWt (sartd:g 'cargo-weight data))
  (setq combWt  (sartd:g 'combined-weight data))

  ; Coordinate origin symbols at the load origin in each view.
  (setq coordPlan (list (car planBase) (cadr planBase) 0.0))
  (setq coordSide (list (car sideBase) (+ (cadr sideBase) loadBot) 0.0))
  (setq coordEnd  (list (car endBase)  (+ (cadr endBase) loadBot) 0.0))
  (sartd:draw-coordinate-symbol coordPlan "X-Y")
  (sartd:draw-coordinate-symbol coordSide "X-Z")
  (sartd:draw-coordinate-symbol coordEnd  "Y-Z")

  ; Cargo / Combined COG in plan view.
  ; v62: plan labels are moved to a clear label zone to prevent overlap with COG symbols and each other.
  (sartd:v62-draw-plan-cogs data planBase)

  ; Cargo COG in side/end views
  (sartd:draw-cog (+ (car sideBase) cx) (+ (cadr sideBase) cz) "CARGO COG" cargoWt)
  (sartd:draw-cog (+ (car endBase) cy) (+ (cadr endBase) cz) "CARGO COG" cargoWt)

  ; Combined COG in side/end views
  (sartd:draw-cog (+ (car sideBase) ccx) (+ (cadr sideBase) ccz) "COMBINED COG" combWt)
  (sartd:draw-cog (+ (car endBase) ccy) (+ (cadr endBase) ccz) "COMBINED COG" combWt)

  (sartd:pr "Stage: dimensions...")
  ; ---- dimensions based on the example PDF, including COG origin dimensions.
  (sartd:draw-basic-dimensions data planBase sideBase endBase maxLen endWidth)
  (sartd:draw-cog-origin-dims coordPlan (list (+ (car planBase) cx) (+ (cadr planBase) cy)) "X-Y")
  (sartd:draw-cog-origin-dims coordSide (list (+ (car sideBase) cx) (+ (cadr sideBase) cz)) "X-Z")
  (sartd:draw-cog-origin-dims coordEnd  (list (+ (car endBase) cy) (+ (cadr endBase) cz)) "Y-Z")

  (sartd:pr "Stage: COG envelope and extents...")
  ; COG envelope in plan around cargo COG
  (setq envx (sartd:g 'cog-env-x data))
  (setq envy (sartd:g 'cog-env-y data))
  (if (or (> envx 0.0) (> envy 0.0))
    (progn
      (sartd:add-rect (+ (car planBase) cx (- envx)) (+ (cadr planBase) cy (- envy))
                      (+ (car planBase) cx envx) (+ (cadr planBase) cy envy) "SARTD-COG")))

  ; Model-space extents used later by PaperSpace viewport fitting.
  ; v0.9.9.4.3.16: keep this box tight and based on the known generated drawing zones,
  ; rather than the old large padding box. This behaves more like viewport Zoom All:
  ; fit the real generated arrangement, then snap the raw fit scale to a standard scale.
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower2 (* -3.2 gap))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L))
  (setq minEquipLeft (if trailers (min 0.0 (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers))) 0.0))
  (setq sideDimX2 (+ (car sideBase) sideRight (* 6.0 gap)))
  (setq endDimX2 (+ (car endBase) W 700.0 gap))
  (setq extMinX
    (min
      (+ (car planBase) minEquipLeft (- 1200.0))
      (- groundStart gap)
      (+ (car sideBase) minEquipLeft (- gap))))
  (setq extMaxX
    (max
      (+ (car planBase) maxTrailerRight (max 6500.0 (* 6.0 gap)))
      sideDimX2
      endDimX2
      endGroundEnd
      (+ (car endBase) W (* 2.0 gap))
      (+ (car sideBase) sideRight (* 6.0 gap))))
  (setq extMinY
    (min
      (- (cadr planBase) (* 3.8 gap))
      (- (cadr sideBase) (* 3.5 gap))
      (- (cadr endBase) (* 2.2 gap))))
  (setq extMaxY
    (max
      (+ (cadr sideBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr endBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr planBase) W topOff (sartd:auto-title-clearance) (* 0.5 gap))))
  (sartd:save-extents (list extMinX extMinY) (list extMaxX extMaxY))
  ; Keep calculated extents only. Do not call object GetBoundingBox here; dynamic blocks / hatches can trigger Function cancelled.

  ; v62 draw-order cleanup: trailer blocks behind everything, dimensions above all generated geometry.
  (sartd:v62-apply-draw-order)

  (sartd:pr "Arrangement drawn in ModelSpace. Stage commands: SARTDRUN internal workflow only."))

(defun sartd:pad-left (s len ch)
  (while (< (strlen s) len) (setq s (strcat ch s)))
  s)

(defun sartd:fmtfixed (v decimals / n sign scale total whole frac)
  ; Fixed decimal formatting copied in behaviour from SARENS_Trailerdataimport.
  ; This avoids AutoCAD DIMZIN/RTOS suppressing trailing zeros.
  (setq n (sartd:num v 0.0))
  (setq sign (if (< n 0.0) "-" ""))
  (setq scale (fix (expt 10.0 decimals)))
  (setq total (fix (+ (* (abs n) scale) 0.5)))
  (setq whole (/ total scale))
  (setq frac (rem total scale))
  (if (> decimals 0)
    (strcat sign (itoa whole) "." (sartd:pad-left (itoa frac) decimals "0"))
    (strcat sign (itoa whole))))

(defun sartd:fmt0 (v) (sartd:fmtfixed v 0))
(defun sartd:fmt1 (v) (sartd:fmtfixed v 1))
(defun sartd:fmt2 (v) (sartd:fmtfixed v 2))
(defun sartd:fmtplus2 (v) (strcat "+/-" (sartd:fmtfixed (abs (sartd:num v 0.0)) 2)))
(defun sartd:fmtplus1 (v) (strcat "+/-" (sartd:fmtfixed (abs (sartd:num v 0.0)) 1)))

(defun sartd:cell-display (sh addr / r v)
  (if sh
    (progn
      (setq r (vl-catch-all-apply 'vlax-get-property (list sh 'Range addr)))
      (if (vl-catch-all-error-p r)
        ""
        (progn
          (setq v (vl-catch-all-apply 'vlax-get-property (list r 'Text)))
          (if (vl-catch-all-error-p v) "" (sartd:str v)))))
    ""))

(defun sartd:cell-text (sh addr)
  (sartd:str (sartd:cell sh addr)))

(defun sartd:cell-fixed-display (sh addr dec)
  (sartd:fmtfixed (sartd:num (sartd:cell-display sh addr) 0.0) dec))

(defun sartd:cell-int-display (sh addr)
  (itoa (fix (sartd:num (sartd:cell-display sh addr) 0.0))))

(defun sartd:max-cells-display-fixed (sh cells dec / c cur maxv started)
  (setq started nil maxv 0.0)
  (foreach c cells
    (setq cur (sartd:num (sartd:cell-display sh c) 0.0))
    (if (not started)
      (progn (setq maxv cur) (setq started T))
      (if (> cur maxv) (setq maxv cur))))
  (sartd:fmtfixed maxv dec))

(defun sartd:ex-fixed (ex addr dec)
  (if ex (sartd:cell-fixed-display ex addr dec) "-"))

(defun sartd:ex-int (ex addr)
  (if ex (sartd:cell-int-display ex addr) "-"))

(defun sartd:ex-text (ex addr)
  (if ex (sartd:cell-text ex addr) ""))

(defun sartd:first-present-cell-display (sh cells / c v out)
  ; Returns the first non-blank displayed cell value from a supplied ordered cell list.
  ; Used for revision/signature fields where the latest populated revision row should win.
  (setq out "")
  (foreach c cells
    (if (= out "")
      (progn
        (setq v (vl-string-trim " \t\n\r" (sartd:cell-display sh c)))
        (if (/= v "") (setq out v)))))
  out)

(defun sartd:revision-cell-downup (sh col / cells r)
  ; Scan from row 12 upward to row 8. This treats the lowest populated revision row as the active/latest entry.
  (setq cells nil)
  (setq r 12)
  (while (>= r 8)
    (setq cells (append cells (list (strcat col (itoa r)))))
    (setq r (1- r)))
  (sartd:first-present-cell-display sh cells))

(defun sartd:v39-trim (s)
  (vl-string-trim " \t\n\r" (sartd:str s)))

(defun sartd:v39-cell-or-empty (sh addr / v)
  (setq v (if sh (sartd:cell-display sh addr) ""))
  (sartd:v39-trim v))

(defun sartd:v39-cell-or-dash (sh addr / v)
  (setq v (sartd:v39-cell-or-empty sh addr))
  (if (= v "") "-" v))

(defun sartd:v39-first-cell-or-empty (sh cols row / out c)
  (setq out "")
  (foreach c cols
    (if (= out "")
      (setq out (sartd:v39-cell-or-empty sh (strcat c (itoa row))))))
  out)

(defun sartd:v39-first-cell-or-dash (sh cols row / out)
  (setq out (sartd:v39-first-cell-or-empty sh cols row))
  (if (= out "") "-" out))

(defun sartd:v39-rev-row-active-p (sh row / v)
  ; Treat the revision row as active if any normal revision-table field is populated.
  ; B/A are tried for revision number because some title sheets put Rev in A, some in B.
  (setq v (strcat
            (sartd:v39-first-cell-or-empty sh '("B" "A") row)
            (sartd:v39-cell-or-empty sh (strcat "C" (itoa row)))
            (sartd:v39-cell-or-empty sh (strcat "D" (itoa row)))
            (sartd:v39-cell-or-empty sh (strcat "L" (itoa row)))
            (sartd:v39-cell-or-empty sh (strcat "M" (itoa row)))
            (sartd:v39-cell-or-empty sh (strcat "N" (itoa row)))))
  (/= v ""))

(defun sartd:v39-ten-status (sh row / v)
  ; Prefer a status cell if the workbook has one; otherwise use the drawing approval state for populated rows.
  (setq v (sartd:v39-first-cell-or-empty sh '("K" "E") row))
  (cond
    ((/= v "") v)
    ((sartd:v39-rev-row-active-p sh row) "For Information")
    (T "-")))

(defun sartd:v39-first-present-row-cell (sh cols startRow endRow / r out)
  (setq out "")
  (setq r startRow)
  (while (and (>= r endRow) (= out ""))
    (setq out (sartd:v39-first-cell-or-empty sh cols r))
    (setq r (1- r)))
  (if (= out "") "-" out))

(defun sartd:equipment-from-model (model brand / s)
  ; v0.9.9.4.3.45: border EQUIPMENT title uses Sarens short trailer naming for K24 and K25.
  (setq s (strcase (sartd:str model)))
  (cond
    ((or (wcmatch s "*K2400*ST*") (wcmatch s "*K24*")) "KAMAG K24_ST")
    ((sartd:model-k25-h-p s) "KAMAG K25_H")
    ((or (wcmatch s "*K2500*3200*SL*") (wcmatch s "*K25*SL*")) "KAMAG K25_SL")
    ((or (wcmatch s "*K2500*") (wcmatch s "*K25*")) "KAMAG K25_ST")
    ((and brand (/= (sartd:str brand) "") (/= (sartd:str model) "")) (strcat (sartd:str brand) " " (sartd:str model)))
    ((/= (sartd:str model) "") (sartd:str model))
    (T "KAMAG K24_ST")))

(defun sartd:current-border-scale-string (/ sc)
  (setq sc (sartd:current-view-scale))
  (strcat "1:" (itoa sc)))
(defun sartd:hydro-cell (ex row group / col v)
  ; Hydraulic pressure values from Export to DWG rows 43:47.
  ; Group columns are C/D/E for groups 1/2/3. Group 4 is not present in this workbook yet.
  (if (= group 4)
    "-"
    (progn
      (setq col (nth (1- group) '("C" "D" "E")))
      (if (and ex col)
        (progn
          (setq v (sartd:num (sartd:cell ex (strcat col (itoa row))) 0.0))
          (sartd:fmt0 v))
        "-"))))

(defun sartd:attr-map (data / trailers first brand model equipment cargo packing totalW ex sh ppWeight ppCount powpack m)
  ; v0.8.3.1: attribute values now follow SARENS_Trailerdataimport cell mapping/formatting.
  ; Keys are normalised to match tags with/without underscores.
  (setq trailers (sartd:g 'trailers data))
  (setq first (if trailers (car trailers) nil))
  (setq ex (sartd:g 'export-sheet data))
  (setq sh (sartd:g 'sheet-main data))
  (setq model (if ex (sartd:ex-text ex "D3") (if first (cdr (assoc 'type first)) "")))
  (setq brand (sartd:brand-from-model model))
  (setq equipment (sartd:equipment-from-model model brand))
  (setq cargo (if ex (sartd:num (sartd:cell-display ex "C12") 0.0) (sartd:g 'cargo-weight data)))
  (setq packing (if ex (sartd:num (sartd:cell-display ex "C13") 0.0) (sartd:g 'packing-weight data)))
  (setq totalW (if ex (sartd:num (sartd:cell-display ex "C18") 0.0) (sartd:g 'combined-weight data)))
  (setq ppWeight (if ex (sartd:num (sartd:cell-display ex "C14") 0.0) 0.0))
  (setq ppCount (if ex (sartd:num (sartd:cell ex "C10") 0.0) (sartd:g 'total-powerpacks data)))
  (setq powpack (if (/= ppCount 0.0) (sartd:fmtfixed (/ ppWeight ppCount) 1) "0"))

  (setq m
    (list
      ; General headings
      (cons "CARGONAME" "Trailer Loading and Capacity")
      (cons "TRAILERSPECIFICS" "Trailer Specifics")
      (cons "PARAMETERS" "Parameters")

      ; Sarens paper-space border / SAR_Border_Project title block mapping
      ; Source cells are from the Load and Stability Calculation sheet.
      (cons "CLIENT" (sartd:cell-display sh "H4"))
      (cons "EQUIPMENT" equipment)
      (cons "DESCRIPTION1" "Transport drawing")
      (cons "DESCRIPTION2" "-")
      (cons "OWNER" "Sarens")
      (cons "DOCUMENTNUMBER" (sartd:cell-display sh "D22"))
      (cons "SITE" (sartd:cell-display sh "H5"))
      (cons "PROJECT" (sartd:cell-display sh "N2"))
      (cons "SIZE" "A3")
      (cons "SHEET" (getvar "CTAB"))
      (cons "DATE" (sartd:cell-display sh "C12"))
      (cons "DESCRIPTION" (sartd:cell-display sh "D12"))
      (cons "DRAWN" (sartd:revision-cell-downup sh "L"))
      (cons "VERIFIED" (sartd:revision-cell-downup sh "M"))
      (cons "APPROVED" (sartd:revision-cell-downup sh "N"))
      (cons "DRAWINGTYPE" "Transport drawing")
      (cons "APPRSTATE" "For Information")
      (cons "SCALE" (sartd:current-border-scale-string))

      ; T.EN / Technip Energies A3 footer title block mapping
      ; Block seen as e.g. *_Title_block_A3_footer1 with TITLE_1/2/3, CLIENT_DOC_REF, SC_DOC_REF, SHT, SCALE, REV, etc.
      ; Title lines are filled from the main project/title data already used by the Sarens border.
      (cons "TITLE_1" (sartd:cell-display sh "N2"))
      (cons "TITLE_2" (sartd:cell-display sh "D12"))
      (cons "TITLE_3" equipment)
      (cons "CLIENT_DOC_REF" (sartd:cell-display sh "D22"))
      (cons "SC_DOC_REF" (sartd:cell-display sh "D22"))
      (cons "SC_LOGO" "SARENS")
      (cons "SHT" "1 OF 1")
      (cons "REV" (sartd:v39-first-present-row-cell sh '("B" "A") 12 8))
      (cons "FOLIO" "1")
      (cons "FOL_BEF" "n/a")
      (cons "FOF_AFT" "n/a")
      (cons "FOL_AFT" "n/a")

      ; T.EN revision table: row 4 is latest/top row, using workbook revision rows 12 down to 9.
      (cons "WRITT4"  (sartd:v39-cell-or-dash sh "L12"))
      (cons "CHKBY4"  (sartd:v39-cell-or-dash sh "M12"))
      (cons "APPBY4"  (sartd:v39-cell-or-dash sh "N12"))
      (cons "DATE4"   (sartd:v39-cell-or-dash sh "C12"))
      (cons "REV4"    (sartd:v39-first-cell-or-dash sh '("B" "A") 12))
      (cons "STATUS4" (sartd:v39-ten-status sh 12))

      (cons "WRITT3"  (sartd:v39-cell-or-dash sh "L11"))
      (cons "CHKBY3"  (sartd:v39-cell-or-dash sh "M11"))
      (cons "APPBY3"  (sartd:v39-cell-or-dash sh "N11"))
      (cons "DATE3"   (sartd:v39-cell-or-dash sh "C11"))
      (cons "REV3"    (sartd:v39-first-cell-or-dash sh '("B" "A") 11))
      (cons "STATUS3" (sartd:v39-ten-status sh 11))

      (cons "WRITT2"  (sartd:v39-cell-or-dash sh "L10"))
      (cons "CHKBY2"  (sartd:v39-cell-or-dash sh "M10"))
      (cons "APPBY2"  (sartd:v39-cell-or-dash sh "N10"))
      (cons "DATE2"   (sartd:v39-cell-or-dash sh "C10"))
      (cons "REV2"    (sartd:v39-first-cell-or-dash sh '("B" "A") 10))
      (cons "STATUS2" (sartd:v39-ten-status sh 10))

      (cons "WRITT1"  (sartd:v39-cell-or-dash sh "L9"))
      (cons "CHKBY1"  (sartd:v39-cell-or-dash sh "M9"))
      (cons "APPBY1"  (sartd:v39-cell-or-dash sh "N9"))
      (cons "DATE1"   (sartd:v39-cell-or-dash sh "C9"))
      (cons "REV1"    (sartd:v39-first-cell-or-dash sh '("B" "A") 9))
      (cons "STATUS1" (sartd:v39-ten-status sh 9))

      ; Trailer Loading and Capacity / Weights Overview - exact Trailerdataimport mapping
      (cons "TRAILERSELFWEIGHT"                 (if ex (sartd:fmtfixed (sartd:num (sartd:cell ex "C17") 0.0) 1) (sartd:fmt1 (- totalW cargo packing ppWeight))))
      (cons "CARGOWEIGHT"                       (if ex (sartd:ex-fixed ex "C12" 1) (sartd:fmt1 cargo)))
      (cons "TOTALPOWERPACKSELFWEIGHT"          (if ex (sartd:ex-fixed ex "C14" 1) (sartd:fmt1 ppWeight)))
      (cons "PACKINGWEIGHT"                     (if ex (sartd:ex-fixed ex "C13" 1) (sartd:fmt1 packing)))
      (cons "TOTALWEIGHT"                       (if ex (sartd:ex-fixed ex "C18" 1) (sartd:fmt1 totalW)))

      (cons "TOTALNUMBEROFACTIVEBOGIESTOTAL"   (sartd:ex-int ex "C9"))
      (cons "TOTALNUMBEROFACTIVEBOGIESGROUP1"  (sartd:ex-int ex "D9"))
      (cons "TOTALNUMBEROFACTIVEBOGIESGROUP2"  (sartd:ex-int ex "F9"))
      (cons "TOTALNUMBEROFACTIVEBOGIESGROUP3"  (sartd:ex-int ex "H9"))
      (cons "TOTALNUMBEROFACTIVEBOGIESGROUP4"  "-")

      (cons "TOTALLOADONGROUPTOTAL"            (sartd:ex-fixed ex "C18" 1))
      (cons "TOTALLOADONGROUPGROUP1"           (sartd:ex-fixed ex "D18" 1))
      (cons "TOTALLOADONGROUPGROUP2"           (sartd:ex-fixed ex "F18" 1))
      (cons "TOTALLOADONGROUPGROUP3"           (sartd:ex-fixed ex "H18" 1))
      (cons "TOTALLOADONGROUPGROUP4"           "-")

      (cons "AXLELINELOADFROMNEUTRALCOGTOTAL"  (sartd:ex-fixed ex "C23" 1))
      (cons "AXLELINELOADFROMNEUTRALCOGGROUP1" (sartd:ex-fixed ex "D23" 1))
      (cons "AXLELINELOADFROMNEUTRALCOGGROUP2" (sartd:ex-fixed ex "F23" 1))
      (cons "AXLELINELOADFROMNEUTRALCOGGROUP3" (sartd:ex-fixed ex "H23" 1))
      (cons "AXLELINELOADFROMNEUTRALCOGGROUP4" "-")

      (cons "MAXAXLELINELOADCOGENVELOPETOTAL"  (if ex (sartd:max-cells-display-fixed ex '("E23" "G23" "I23") 1) "-"))
      (cons "MAXAXLELINELOADCOGENVELOPEGROUP1" (sartd:ex-fixed ex "E23" 1))
      (cons "MAXAXLELINELOADCOGENVELOPEGROUP2" (sartd:ex-fixed ex "G23" 1))
      (cons "MAXAXLELINELOADCOGENVELOPEGROUP3" (sartd:ex-fixed ex "I23" 1))
      (cons "MAXAXLELINELOADCOGENVELOPEGROUP4" "-")

      (cons "MAXCAPACITYUTILISATIONTOTAL"      (if ex (sartd:max-cells-display-fixed ex '("E25" "G25" "I25") 1) "-"))
      (cons "MAXCAPACITYUTILISATIONGROUP1"     (sartd:ex-fixed ex "E25" 1))
      (cons "MAXCAPACITYUTILISATIONGROUP2"     (sartd:ex-fixed ex "G25" 1))
      (cons "MAXCAPACITYUTILISATIONGROUP3"     (sartd:ex-fixed ex "I25" 1))
      (cons "MAXCAPACITYUTILISATIONGROUP4"     "-")

      (cons "GROUNDBEARINGPRESSURETOTAL"       (sartd:ex-fixed ex "C26" 1))
      (cons "GROUNDBEARINGPRESSUREGROUP1"      (sartd:ex-fixed ex "D26" 1))
      (cons "GROUNDBEARINGPRESSUREGROUP2"      (sartd:ex-fixed ex "F26" 1))
      (cons "GROUNDBEARINGPRESSUREGROUP3"      (sartd:ex-fixed ex "H26" 1))
      (cons "GROUNDBEARINGPRESSUREGROUP4"      "-")

      ; Trailer Stability - exact Trailerdataimport mapping
      (cons "CARGOANGLE"    (sartd:fmtfixed (sartd:g 'basic-tipping data) 1))
      (cons "COMBINEDANGLE" (sartd:fmtfixed (sartd:g 'dynamic-tipping data) 1))
      (cons "CARGO_ANGLE"   (sartd:fmtfixed (sartd:g 'basic-tipping data) 1))
      (cons "COMBINED_ANGLE" (sartd:fmtfixed (sartd:g 'dynamic-tipping data) 1))

      ; Trailer Specifics - exact Trailerdataimport mapping
      (cons "BRAND" (if brand brand ""))
      (cons "MODEL" model)
      (cons "GROSSAXLELINECAPACITY" (sartd:ex-text ex "D4"))
      (cons "AXLELINESELFWEIGHT" (sartd:ex-text ex "D6"))
      (cons "POWERPACKSELFWEIGHT" powpack)
      (cons "TOTALNUMBEROFAXLELINES" (sartd:ex-int ex "C7"))
      (cons "TOTALNUMBEROFPOWERPACKS" (sartd:ex-int ex "C10"))
      (cons "CONFIGURATION" (sartd:ex-int ex "C7"))
      (cons "TOTALNOOFAXLELINES" (sartd:ex-int ex "C7"))
      (cons "TOTALNOOFPOWERPACKS" (sartd:ex-int ex "C10"))

      ; Parameters - exact Trailerdataimport mapping
      (cons "COGXPOS"         (sartd:fmtplus2 (if ex (sartd:num (sartd:cell ex "C29") 0.0) 0.0)))
      (cons "COGYPOS"         (sartd:fmtplus2 (if ex (sartd:num (sartd:cell ex "C30") 0.0) 0.0)))
      (cons "GOGXPOS"         (sartd:fmtplus2 (if ex (sartd:num (sartd:cell ex "C29") 0.0) 0.0)))
      (cons "GOGYPOS"         (sartd:fmtplus2 (if ex (sartd:num (sartd:cell ex "C30") 0.0) 0.0)))
      (cons "LONGITUDINALUP"  (sartd:fmtplus1 (sartd:g 'longitudinal-up data)))
      (cons "TRAVERSAL"       (sartd:fmtplus1 (sartd:g 'transversal data)))
      (cons "VVALUE"          (sartd:fmt0 (sartd:g 'vwind data)))
      (cons "VWIND"           (sartd:fmt0 (sartd:g 'vwind data)))
      (cons "ACCELLONG"       (sartd:fmt1 (sartd:g 'accel-long data)))

      ; Hydraulic Suspension Pressures (bar) - exact Trailerdataimport mapping
      (cons "NEUTRALGROUP1" (sartd:hydro-cell ex 43 1))
      (cons "NEUTRALGROUP2" (sartd:hydro-cell ex 43 2))
      (cons "NEUTRALGROUP3" (sartd:hydro-cell ex 43 3))
      (cons "NEUTRALGROUP4" "-")

      (cons "AGROUP1" (sartd:hydro-cell ex 44 1))
      (cons "AGROUP2" (sartd:hydro-cell ex 44 2))
      (cons "AGROUP3" (sartd:hydro-cell ex 44 3))
      (cons "AGROUP4" "-")

      (cons "BGROUP1" (sartd:hydro-cell ex 45 1))
      (cons "BGROUP2" (sartd:hydro-cell ex 45 2))
      (cons "BGROUP3" (sartd:hydro-cell ex 45 3))
      (cons "BGROUP4" "-")

      (cons "CGROUP1" (sartd:hydro-cell ex 46 1))
      (cons "CGROUP2" (sartd:hydro-cell ex 46 2))
      (cons "CGROUP3" (sartd:hydro-cell ex 46 3))
      (cons "CGROUP4" "-")

      (cons "DGROUP1" (sartd:hydro-cell ex 47 1))
      (cons "DGROUP2" (sartd:hydro-cell ex 47 2))
      (cons "DGROUP3" (sartd:hydro-cell ex 47 3))
      (cons "DGROUP4" "-")

      ; Drawing/load dimension convenience attributes
      (cons "LOADLENGTH" (sartd:fmt0 (sartd:g 'load-length data)))
      (cons "LOADWIDTH" (sartd:fmt0 (sartd:g 'load-width data)))
      (cons "LOADHEIGHT" (sartd:fmt0 (sartd:g 'load-height data)))
      (cons "TRANSPORTHEIGHT" (sartd:fmt0 (+ (sartd:g 'deck-height data) (sartd:g 'packing-height data) (sartd:g 'load-height data)))))
  )
  m)
(defun sartd:map-get (key amap / val p)
  (setq val (cdr (assoc key amap)))
  (if val
    val
    (progn
      (foreach p amap
        (if (= (sartd:norm (car p)) key)
          (setq val (cdr p))))
      val)))

(defun sartd:set-block-attributes (br amap / atts a tag key val count)
  (setq count 0)
  (if (and br (= :vlax-true (vla-get-HasAttributes br)))
    (progn
      (setq atts (vlax-invoke br 'GetAttributes))
      (foreach a atts
        (setq tag (vlax-get-property a 'TagString))
        (setq key (sartd:norm tag))
        (setq val (sartd:map-get key amap))
        (if val
          (progn
            (vlax-put-property a 'TextString (sartd:str val))
            (setq count (1+ count)))))))
  count)

(defun sartd:update-selected-annotations (data / ss i ent obj amap total)
  ; Existing annotation blocks live in PaperSpace, so force true PaperSpace before selection.
  (sartd:go-paperspace)
  (setq amap (sartd:attr-map data))
  (setq ss (vl-catch-all-apply 'ssget (list '((0 . "INSERT")))))
  (cond
    ((vl-catch-all-error-p ss)
      (sartd:pr "Annotation selection cancelled."))
    (ss
      (setq i 0 total 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq obj (vlax-ename->vla-object ent))
        (setq total (+ total (sartd:set-block-attributes obj amap)))
        (setq i (1+ i)))
      (sartd:pr (strcat "Updated " (itoa total) " matching annotation attribute(s).")))
    (T (sartd:pr "No annotation blocks selected."))))


(defun sartd:update-vla-list-annotations (objs amap / total obj)
  (setq total 0)
  (foreach obj objs
    (if obj
      (progn
        (vl-catch-all-apply 'vla-put-Layer (list obj "SARTD-ANNOTATION"))
        (if (= (strcase (vlax-get-property obj 'ObjectName)) "ACDBBLOCKREFERENCE")
          (setq total (+ total (sartd:set-block-attributes obj amap)))))))
  total)

(defun sartd:annotation-blocks ()
  ; Known annotation attribute blocks from SARENS_Trailer_Data_Annotation_blocks.dwg.
  ; Format: (block-name x-offset y-offset description)
  '( ("Y3W6R2S8N0_A"        0.0      0.0   "Trailer Specifics")
     ("Z6A3L2E3E7_D"        0.0  -1700.0   "Parameters")
     ("TRAILER_STABILITY"   0.0  -3400.0   "Trailer Stability")
     ("A5H1C4O7Q8_B"        0.0  -5200.0   "Weights / Loading Capacity")
     ("Y7B8F3E0P2_C"        0.0  -7600.0   "Hydraulic / Group Table")))

(defun sartd:missing-annotation-blocks (/ out b)
  (setq out nil)
  (foreach item (sartd:annotation-blocks)
    (setq b (car item))
    (if (not (tblsearch "BLOCK" b)) (setq out (append out (list b)))))
  out)


(defun sartd:ensure-annotation-blocks (/ missing)
  (sartd:ensure-library-defs)
  (setq missing (sartd:missing-annotation-blocks))
  (if missing
    (progn
      (sartd:pr "Still missing one or more annotation blocks after unified library import:")
      (foreach b missing (princ (strcat "\n  - " b)))
      nil)
    T))

(defun sartd:insert-annotation-blocks (data / amap total item b desc br oldspace pt ans)
  (sartd:ensure-annotation-blocks)
  (sartd:go-paperspace)
  (sartd:pr "Switched fully to PaperSpace. Pick annotation block locations on the layout sheet.")
  (setq oldspace sartd:*space-override*)
  (setq sartd:*space-override* (sartd:paperspace))
  (setq amap (sartd:attr-map data))
  (setq total 0)
  (foreach item (sartd:annotation-blocks)
    (setq b (nth 0 item))
    (setq desc (nth 3 item))
    (initget "Yes No")
    (setq ans (getkword (strcat "\nInsert " desc " annotation block? [Yes/No] <Yes>: ")))
    (if (null ans) (setq ans "Yes"))
    (if (= ans "Yes")
      (if (tblsearch "BLOCK" b)
        (progn
          (setq pt (sartd:getpoint-safe (strcat "\nPick PAPERSPACE insertion point for " desc ": ")))
          (if pt
            (progn
              (setq br (sartd:insert-block b (list (car pt) (cadr pt) 0.0) "SARTD-ANNOTATION"))
              (if br
                (progn
                  (sartd:tag (vlax-vla-object->ename br) "ANNOTATION")
                  (setq total (+ total (sartd:set-block-attributes br amap))))))
            (sartd:pr (strcat desc " insertion skipped - no point selected."))))
        (sartd:pr (strcat "Annotation block not found, skipped: " b)))))
  (sartd:pr (strcat "Inserted/updated " (itoa total) " matching annotation attribute(s)."))
  (setq sartd:*space-override* oldspace))

(defun sartd:insert-annotation-dwg (data)
  ; v0.8.3: Import annotation DWG definitions, then insert the real named attribute blocks.
  ; This replaces the previous whole-DWG reference insertion, which could appear not to paste.
  (sartd:insert-annotation-blocks data))

(defun sartd:annotation-workflow (data / ans)
  (initget "Insert Select Skip")
  (setq ans (getkword "\nAnnotation blocks [Insert new in PaperSpace/Select existing/Skip] <Select>: "))
  (if (null ans) (setq ans "Select"))
  (cond
    ((= ans "Insert") (sartd:insert-annotation-dwg data))
    ((= ans "Select") (sartd:update-selected-annotations data))
    (T (sartd:pr "Annotation update skipped."))))

; ----------------------------- DEBUG -------------------------------------------------------------
(defun sartd:dump-dynprops (br showAtts / props p pname val allowed atts a valstr avstr av count)
  (if br
    (progn
      (setq props (sartd:dynprops-list br))
      (if props
        (progn
          (princ "
--- Dynamic properties ---")
          (foreach p props
            (setq pname (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
            (if (not (vl-catch-all-error-p pname))
              (progn
                (setq val (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
                (setq valstr (if (vl-catch-all-error-p val) "<error>" (sartd:str val)))
                (princ (strcat "
" pname " = " valstr))
                (setq allowed (sartd:dyn-allowed p))
                (if allowed
                  (progn
                    (princ " | Allowed: ")
                    (setq count 0)
                    (foreach av allowed
                      (if (< count 40)
                        (progn
                          (setq avstr (vl-catch-all-apply 'sartd:str (list av)))
                          (if (not (vl-catch-all-error-p avstr))
                            (princ (strcat avstr "; ")))))
                      (setq count (1+ count)))
                    (if (> count 40) (princ "..."))))))))
        (princ "
No dynamic properties found."))
      (if showAtts
        (if (= :vlax-true (vla-get-HasAttributes br))
          (progn
            (princ "
--- Attributes ---")
            (setq atts (vlax-invoke br 'GetAttributes))
            (foreach a atts
              (princ (strcat "
" (vlax-get-property a 'TagString) " = " (vlax-get-property a 'TextString)))))
          (princ "
No attributes found."))))))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; ----------------------------- READ DEBUG SUMMARY ---------------------------------------------------
(defun sartd:print-data-summary (data / trailers tr supportX supportW i)
  (setq trailers (sartd:g 'trailers data))
  (setq supportX (sartd:g 'support-x data))
  (setq supportW (sartd:g 'support-weight data))
  (sartd:pr "--- Excel read debug values ---")
  (sartd:pr (strcat "Htrailer source = " (sartd:g 'htrailer-source data) " | value = " (rtos (/ (sartd:g 'deck-height data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C52 Load length = " (rtos (/ (sartd:g 'load-length data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C53 Load width  = " (rtos (/ (sartd:g 'load-width data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C56 Load height = " (rtos (/ (sartd:g 'load-height data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C63 Cargo weight = " (rtos (sartd:g 'cargo-weight data) 2 3) " t"))
  (sartd:pr (strcat "C64/C65/C66 Cargo COG = X " (rtos (/ (sartd:g 'cargo-cog-x data) 1000.0) 2 3) " m, Y " (rtos (/ (sartd:g 'cargo-cog-y data) 1000.0) 2 3) " m, Z " (rtos (/ (sartd:g 'cargo-cog-z data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "E64/E65 COG envelope = X +/-" (rtos (/ (sartd:g 'cog-env-x data) 1000.0) 2 3) " m, Y +/-" (rtos (/ (sartd:g 'cog-env-y data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C70 Packing weight = " (rtos (sartd:g 'packing-weight data) 2 3) " t"))
  (sartd:pr (strcat "C71 Packing height = " (rtos (/ (sartd:g 'packing-height data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "C72/C73/C74 Packing COG = X " (rtos (/ (sartd:g 'packing-cog-x data) 1000.0) 2 3) " m, Y " (rtos (/ (sartd:g 'packing-cog-y data) 1000.0) 2 3) " m, Z " (rtos (/ (sartd:g 'packing-cog-z data) 1000.0) 2 3) " m"))
  (setq i 1)
  (while (<= i (length supportX))
    (sartd:pr (strcat "Support " (itoa i) " E" (itoa (+ 70 i)) " = X " (rtos (/ (nth (1- i) supportX) 1000.0) 2 3) " m | F" (itoa (+ 70 i)) " = " (rtos (nth (1- i) supportW) 2 3) " t"))
    (setq i (1+ i)))
  (sartd:pr (strcat "F129/G129/H129/I129 Combined = W " (rtos (sartd:g 'combined-weight data) 2 3) " t, X " (rtos (/ (sartd:g 'combined-cog-x data) 1000.0) 2 3) " m, Y " (rtos (/ (sartd:g 'combined-cog-y data) 1000.0) 2 3) " m, Z " (rtos (/ (sartd:g 'combined-cog-z data) 1000.0) 2 3) " m"))
  (sartd:pr (strcat "Export to DWG C29/C30 = COGX " (sartd:fmtplus2 (sartd:g 'export-cogx data)) " m, COGY " (sartd:fmtplus2 (sartd:g 'export-cogy data)) " m"))
  (sartd:pr (strcat "H291/H292 slopes = Longitudinal " (sartd:fmtplus1 (sartd:g 'longitudinal-up data)) " deg, Transversal " (sartd:fmtplus1 (sartd:g 'transversal data)) " deg"))
  (sartd:pr (strcat "E353/E354 = Vwind " (itoa (sartd:int (sartd:g 'vwind data) 0)) " m/s, AccelLong " (sartd:fmt1 (sartd:g 'accel-long data))))
  (sartd:pr (strcat "L503/L505 tipping = Basic " (sartd:fmt1 (sartd:g 'basic-tipping data)) " deg, Dynamic " (sartd:fmt1 (sartd:g 'dynamic-tipping data)) " deg"))
  (sartd:pr (strcat "Trailer rows found = " (itoa (length trailers))))
  (sartd:pr (strcat "Hydraulic grouping side rows found = " (itoa (length (sartd:g 'hydraulic-grouping data)))))
  (sartd:pr (strcat "Pinned axle trailer rows found = " (itoa (length (sartd:g 'pinned-axles data)))))
  (foreach tr trailers
    (sartd:pr
      (strcat
        "Row " (itoa (cdr (assoc 'row tr)))
        " | B Type=" (cdr (assoc 'type tr))
        " | C Axles=" (itoa (cdr (assoc 'axles tr)))
        " | E X=" (rtos (/ (cdr (assoc 'x tr)) 1000.0) 2 3) "m"
        " | F Y=" (rtos (/ (cdr (assoc 'y tr)) 1000.0) 2 3) "m"
        " | G spacing=" (rtos (/ (cdr (assoc 'spacing tr)) 1000.0) 2 3) "m"
        " | H length=" (rtos (/ (cdr (assoc 'length tr)) 1000.0) 2 3) "m"
        " | I width=" (rtos (/ (cdr (assoc 'width tr)) 1000.0) 2 3) "m"
        " | J/K PPU=" (cdr (assoc 'ppu-state tr))
        " | L/M PP wt=" (rtos (cdr (assoc 'ppu-left-weight tr)) 2 3) "/" (rtos (cdr (assoc 'ppu-right-weight tr)) 2 3) "t"
        " | N self=" (rtos (cdr (assoc 'self-weight tr)) 2 3) "t")))
  (sartd:pr "--- End Excel read debug ---"))

; ----------------------------- MAIN COMMANDS -----------------------------------------------------
(defun sartd:strict-selected-paper-viewport (prompt / pick ent obj objname)
  ; v0.9.9.4: strict PaperSpace-only viewport selection.
  ; This function never switches to ModelSpace, never activates a floating viewport,
  ; and never changes layouts. It only works when the user is already in PaperSpace.
  (setq obj nil)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "This command is PaperSpace only. It is not allowed to run from the Model tab."))
    ((/= (getvar "CVPORT") 1)
      (sartd:pr "You are currently inside a model-space viewport. Run PSPACE, then rerun this command."))
    (T
      (setq pick (vl-catch-all-apply 'entsel (list prompt)))
      (cond
        ((vl-catch-all-error-p pick)
          (sartd:pr "Viewport selection cancelled."))
        ((not (car pick))
          (sartd:pr "No viewport selected."))
        (T
          (setq ent (car pick))
          (setq obj (vlax-ename->vla-object ent))
          (setq objname (strcase (sartd:str (vla-get-ObjectName obj))))
          (if (/= objname "ACDBVIEWPORT")
            (progn
              (setq obj nil)
              (sartd:pr "Selected object is not a PaperSpace viewport.")))))))
  obj)

(defun sartd:scale-from-selected-viewport-only (/ vp sc)
  ; v0.9.9.4: single clean PaperSpace command replacing SARTDSCALE and SARTDVPFIT.
  ; Select a PaperSpace viewport and use its scale to update generated dimensions,
  ; generated text, COG blocks, coordinate symbols and ground blocks.
  ; It deliberately does NOT scale trailers, pinned axle blocks or hydraulic group blocks.
  (vl-load-com)
  (sartd:setup-layers)
  (setq vp (sartd:strict-selected-paper-viewport "\nSelect PaperSpace viewport to read scale from: "))
  (if vp
    (progn
      (setq sc (sartd:viewport-scale-from-object vp))
      (setq sartd:*last-viewport-scale* sc)
      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa sc))
      (sartd:scale-generated-dims sc)
      (sartd:scale-generated-callouts sc)
      (sartd:pr
        (strcat
          "Updated generated dims/text/allowed blocks to selected viewport scale 1:"
          (itoa sc)
          ". Trailers, pinned axle blocks and hydraulic group blocks were not scaled."))))
  (princ))


(defun sartd:run-model-auto-0 (/ data base oldauto)
  ; v0.9.9.4.3: internal auto workflow step.
  ; Reads the Active Excel workbook and draws at model-space 0,0 without user prompts.
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (sartd:setup-layers)
  (sartd:go-modelspace)
  (setq data (sartd:read-data nil))
  (setq sartd:*auto-excel-source* oldauto)
  (if data
    (progn
      (sartd:print-data-summary data)
      (setq base (list 0.0 0.0 0.0))
      (sartd:save-base base)
      (sartd:delete-generated)
      (sartd:sheet-viewport-scale)
      (setq sartd:*space-override* (sartd:modelspace))
      (sartd:draw-arrangement data base)
      (sartd:scale-generated-dims (sartd:current-view-scale))
      (sartd:scale-generated-callouts (sartd:current-view-scale))
      (setq sartd:*space-override* nil)
      (sartd:pr "Auto model draw complete at 0,0 using Active Excel."))
    (sartd:pr "Auto model draw failed: no Active Excel workbook/data was available."))
  (setq sartd:*space-override* nil)
  data)

(defun sartd:run-paper-auto-active (/ oldauto result)
  ; v0.9.9.4.3: import the official PaperSpace sheet using Active Excel for annotation updates.
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq result (vl-catch-all-apply 'sartd:run-paper nil))
  (setq sartd:*auto-excel-source* oldauto)
  (if (vl-catch-all-error-p result)
    (sartd:pr (strcat "Auto PaperSpace import failed: " (vl-catch-all-error-message result))))
  result)

(defun sartd:run-annotation-auto-active (/ oldauto data result)
  ; v0.9.9.4.3.28: missing SARTDALL annotation-stage wrapper.
  ; Updates the PaperSpace annotation blocks from the active Excel workbook without prompting.
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (sartd:read-data T))
  (if data
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq result (vl-catch-all-apply 'sartd:annotation-workflow (list data)))))
  (setq sartd:*auto-excel-source* oldauto)
  (if (vl-catch-all-error-p result)
    (sartd:pr (strcat "Auto annotation update failed: " (vl-catch-all-error-message result))))
  result)

(defun sartd:run-border-auto-active (/ oldauto data result)
  ; v0.9.9.4.3.3: final SARTDALL step - update official Sarens border from Active Excel.
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (sartd:read-data T))
  (if data
    (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data))))
  (setq sartd:*auto-excel-source* oldauto)
  (if (vl-catch-all-error-p result)
    (sartd:pr (strcat "Auto Sarens border update failed: " (vl-catch-all-error-message result))))
  result)

(defun sartd:auto-scale-only-layout-viewport (/ vps vp sc)
  ; v0.9.9.4.3: auto SARTDVS stage.
  ; Must already be on a PaperSpace layout; finds the sheet viewport automatically.
  ; Uses the only viewport if only one exists; otherwise uses the largest one.
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "Auto viewport scale skipped: currently on the Model tab, not PaperSpace."))
    ((/= (getvar "CVPORT") 1)
      (sartd:pr "Auto viewport scale skipped: currently inside a floating viewport. Run PSPACE and retry if needed."))
    (T
      (setq vps (sartd:current-layout-paper-viewports))
      (cond
        ((null vps)
          (sartd:pr "Auto viewport scale skipped: no PaperSpace viewport found on the current sheet."))
        (T
          (setq vp (if (= (length vps) 1) (car vps) (sartd:largest-viewport vps)))
          (setq sc (sartd:viewport-scale-from-object vp))
          (setq sartd:*last-viewport-scale* sc)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa sc))
          (sartd:scale-generated-dims sc)
          (sartd:scale-generated-callouts sc)
          (sartd:pr
            (strcat
              "Auto-selected " (if (= (length vps) 1) "the only" "the largest")
              " PaperSpace viewport and scaled generated dims/text/allowed blocks to 1:"
              (itoa sc) "."))))))
  (princ))

(defun sartd:run-auto-workflow (/ oldauto)
  ; v0.9.9.4.3: one-shot workflow command.
  ; Equivalent to:
  ;   SARTD  -> Active Excel + base point 0,0
  ;   SARTDP -> Active Excel
  ;   SARTDVS -> auto-select only/largest viewport on imported sheet
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr "Auto workflow started: Active Excel, ModelSpace base 0,0, import PaperSpace sheet, auto-scale viewport.")
  (sartd:run-model-auto-0)
  (sartd:run-paper-auto-active)
  (sartd:auto-scale-only-layout-viewport)
  (sartd:run-border-auto-active)
  (setq sartd:*auto-excel-source* oldauto)
  (sartd:pr "Auto workflow complete.")
  (princ))

(defun sartd:run-model (refresh / data base)
  ; v0.8.3.8: ModelSpace command only. No viewport or annotation prompts here.
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-modelspace)
  (setq data (sartd:read-data refresh))
  (if data
    (progn
      (sartd:print-data-summary data)
      (if refresh
        (setq base (sartd:last-base))
        (setq base nil))
      (if (not base)
        (setq base (getpoint "
Pick MODELSPACE PLAN view origin / Excel load 0,0 point: ")))
      (if base
        (progn
          (sartd:save-base base)
          (sartd:delete-generated)
          ; v0.9.8: before redrawing, pull the active/default paper viewport scale so dimensions/text are drawn for that scale.
          (sartd:sheet-viewport-scale)
          (setq sartd:*space-override* (sartd:modelspace))
          (sartd:draw-arrangement data base)
          (sartd:scale-generated-dims (sartd:current-view-scale))
          (sartd:scale-generated-callouts (sartd:current-view-scale))
          (setq sartd:*space-override* nil)
          (sartd:pr "ModelSpace drawing complete. Run SARTDSPACE if needed, then SARTDP, SARTDVS/SARTDAUTOFIT and SARTDA."))
        (sartd:pr "No base point selected."))))
  (setq sartd:*space-override* nil)
  (princ))

(defun sartd:run-viewport (/ ext)
  ; PaperSpace viewport command only. Uses last saved model extents from SARTD/SARTDR.
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq ext (sartd:last-extents))
  (if ext
    (sartd:create-paper-viewport (car ext) (cadr ext))
    (sartd:pr "No saved model extents found. Run SARTD first, then run SARTDP and SARTDVS."))
  (sartd:go-paperspace)
  (princ))


(defun sartd:run-paper (/ data ext layoutName)
  ; v0.8.6.2 PaperSpace command:
  ; Import the exact official layout from the unified library DWG using -LAYOUT Template.
  ; No bottom-left pick, no PaperSpace object copy/paste, no manual viewport fallback.
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq ext (sartd:last-extents))
  (if (not ext)
    (sartd:pr "No saved model extents found. Run SARTD first, then run SARTDP.")
    (progn
      (setq layoutName (sartd:import-library-layout))
      (if layoutName
        (progn
          (if (not (sartd:activate-paper-layout layoutName))
            (sartd:pr (strcat "Warning: imported layout '" layoutName "' could not be made active before viewport fit.")))
          (sartd:fit-current-layout-viewport-default (car ext) (cadr ext))
          (setq data (sartd:read-data T))
          (if data (sartd:update-all-paperspace-annotations data)))
        (sartd:pr "Official PaperSpace sheet import failed. No pasted/manual sheet was created."))))
  (sartd:go-paperspace)
  (setq sartd:*space-override* nil)
  (princ))



(defun sartd:data-signature (data / out p key)
  ; Compare only plain Excel-derived data. Ignore COM workbook/sheet objects.
  (setq out nil)
  (foreach p data
    (setq key (car p))
    (if (not (member key '(workbook sheet-main sheet-export)))
      (setq out (append out (list p)))))
  (vl-princ-to-string out))

(defun sartd:run-refresh-all (/ data res)
  ; v0.9.9.4.3.5: SARTDR refreshes both ModelSpace and PaperSpace.
  ; It redraws the model arrangement from Excel, then uses the current/imported PaperSpace
  ; viewport scale to rescale generated dimensions/text/allowed blocks, and updates annotations/border.
  (vl-load-com)
  (sartd:run-model T)
  (setq res (vl-catch-all-apply 'sartd:go-paperspace nil))
  (if (vl-catch-all-error-p res)
    (sartd:pr (strcat "Refresh PaperSpace switch failed: " (vl-catch-all-error-message res))))
  (if (and (= (getvar "TILEMODE") 0) (= (getvar "CVPORT") 1))
    (progn
      (vl-catch-all-apply 'sartd:auto-scale-only-layout-viewport nil)
      (setq data (sartd:read-data T))
      (if data
        (progn
          (sartd:update-all-paperspace-annotations data)
          (sartd:update-border-attributes data))))
    (sartd:pr "PaperSpace refresh skipped: no valid PaperSpace layout/viewport is active. Run SARTDP first if required."))
  (princ))


(defun sartd:run-space ()
  ; Redraws the ModelSpace arrangement using the v0.9.0 Sarens spacing: side/end above, plan below.
  (sartd:run-model T))

; v0.9.9.1: live polling command fully removed from the active command set.
; These clear old definitions if an earlier version was loaded in the same AutoCAD session.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]




; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; v0.9.9.4: SARTDVPFIT and SARTDSCALE removed.
; Use one PaperSpace-only scale command instead: SARTDVS.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; Legacy viewport command removed. Clear old definitions if older versions were loaded in this session.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; =================================================================================================
; v0.9.9.4.3.21 OVERRIDES
; Purpose:
;   Make SARTDAUTOFIT/SARTDALL behave like the user manually opens the viewport,
;   runs a zoom extents/all-style fit, reads the raw non-standard viewport scale,
;   then snaps to the next standard scale that still fits.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

; Internal-only drafting scale range for SARTDAUTOFIT.
(setq sartd:*standard-scale-denominators*
  '(1 2 4 5 8 10 16 20 25 30 33 40 50 60 75 80 100 125 150 175 200 225 250 275 300 333 350 400 450 500 600 750 1000 1250 1500 2000 2500 5000))
(setq sartd:*standard-scale-add-list*
  '(("1:1" . 1.0)
    ("1:2" . 2.0)
    ("1:4" . 4.0)
    ("1:5" . 5.0)
    ("1:8" . 8.0)
    ("1:10" . 10.0)
    ("1:16" . 16.0)
    ("1:20" . 20.0)
    ("1:25" . 25.0)
    ("1:30" . 30.0)
    ("1:33" . 33.333333)
    ("1:40" . 40.0)
    ("1:50" . 50.0)
    ("1:60" . 60.0)
    ("1:75" . 75.0)
    ("1:80" . 80.0)
    ("1:100" . 100.0)
    ("1:125" . 125.0)
    ("1:150" . 150.0)
    ("1:175" . 175.0)
    ("1:200" . 200.0)
    ("1:225" . 225.0)
    ("1:250" . 250.0)
    ("1:275" . 275.0)
    ("1:300" . 300.0)
    ("1:333" . 333.333333)
    ("1:350" . 350.0)
    ("1:400" . 400.0)
    ("1:450" . 450.0)
    ("1:500" . 500.0)
    ("1:600" . 600.0)
    ("1:750" . 750.0)
    ("1:1000" . 1000.0)
    ("1:1250" . 1250.0)
    ("1:1500" . 1500.0)
    ("1:2000" . 2000.0)
    ("1:2500" . 2500.0)
    ("1:5000" . 5000.0)))

(defun sartd:choose-scale (ratio / scales out s target maxScale)
  ; ratio is required model units per paper unit.
  ; Pick the closest standard scale denominator that is >= the raw fit scale.
  ; Example: raw 137 -> 1:150, raw 163 -> 1:175.
  (setq scales sartd:*standard-scale-denominators*)
  (setq target (max 1.0 (* 1.015 (sartd:num ratio 200.0)))) ; small safety margin against crop
  (setq maxScale (if scales (car (last scales)) 5000))
  (setq out maxScale)
  (foreach s scales
    (if (and (= out maxScale) (>= (float s) target))
      (setq out s)))
  (sartd:scale-int out))

(defun sartd:vp-number (vp / en data n)
  (setq n nil)
  (if vp
    (progn
      (setq en (vl-catch-all-apply 'vlax-vla-object->ename (list vp)))
      (if (and en (not (vl-catch-all-error-p en)))
        (progn
          (setq data (entget en))
          (setq n (cdr (assoc 69 data)))))))
  n)

(defun sartd:activate-paper-viewport-modelspace (vp / doc n r)
  ; Activates the supplied PaperSpace viewport, without asking the user to double-click it.
  ; Returns T if AutoCAD is in floating modelspace for that viewport.
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq r nil)
  (if vp
    (progn
      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
      (vl-catch-all-apply 'vla-put-ActivePViewport (list doc vp))
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-true))
      (if (= (getvar "CVPORT") 1)
        (progn
          (setq n (sartd:vp-number vp))
          (if n (vl-catch-all-apply 'setvar (list "CVPORT" n)))))
      (setq r (/= (getvar "CVPORT") 1))))
  r)

(defun sartd:deactivate-viewport-to-paperspace (/ doc)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
  (vl-catch-all-apply 'setvar (list "CVPORT" 1))
  T)

(defun sartd:fit-vp-by-zoom-all-then-snap (vp / ph vh raw scale ctr ctrx ctry ok)
  ; Opens the viewport, runs AutoCAD Zoom All like a double-middle-click fit,
  ; reads the raw viewport fit scale, then snaps to the next standard scale that still fits.
  ; This fixes the old issue where SARTDAUTOFIT centred using stale calculated extents.
  (setq scale nil)
  (if (not vp)
    nil
    (progn
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (if (<= ph 0.0)
        nil
        (progn
          (setq ok (sartd:activate-paper-viewport-modelspace vp))
          (if ok
            (progn
              ; Zoom All is used because the user requested the same behaviour as opening the viewport and using Zoom > All/fit.
              (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_A"))
              (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
              (if (<= vh 0.0) (setq vh (sartd:num (getvar "VIEWSIZE") 0.0)))
              (setq ctr (getvar "VIEWCTR"))
              (if (and (listp ctr) (>= (length ctr) 2))
                (progn (setq ctrx (car ctr)) (setq ctry (cadr ctr)))
                (progn
                  (setq ctr (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))
                  (setq ctr (sartd:to-list ctr))
                  (setq ctrx (if ctr (car ctr) 0.0))
                  (setq ctry (if (and ctr (cadr ctr)) (cadr ctr) 0.0))))
              (setq raw (if (> ph 0.0) (/ vh ph) sartd:*default-callout-scale*))
              (if (< raw 1.0) (setq raw sartd:*default-callout-scale*))
              (setq scale (sartd:choose-scale raw))
              (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt ctrx ctry 0.0)))
              (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
              (setq sartd:*last-viewport-scale* scale)
              (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
              (sartd:deactivate-viewport-to-paperspace)
              (sartd:pr (strcat "Viewport zoom-all raw fit approx 1:" (itoa (sartd:scale-int raw)) ", snapped to 1:" (itoa scale) ".")))
            (progn
              (sartd:deactivate-viewport-to-paperspace)
              (sartd:pr "Could not activate the PaperSpace viewport for zoom-all fitting.")))))))
  scale)

(defun sartd:run-autofit (/ vp target initialScale finalScale newScale pass stable)
  ; v0.9.9.4.3.21: viewport-fit algorithm now mirrors user workflow:
  ;   activate imported PaperSpace viewport -> Zoom All -> read raw fit -> snap to standard scale.
  ; It then redraws/respaces the model at that scale and performs one final zoom-all snap.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          (setq finalScale initialScale)
          (setq pass 0 stable nil)
          (while (and (< pass 3) (not stable))
            (setq pass (1+ pass))
            (sartd:auto-redraw-spaced-at-scale finalScale)
            (sartd:activate-paper-layout target)
            (sartd:deactivate-viewport-to-paperspace)
            (setq vp (sartd:auto-viewport-from-current-layout))
            (setq newScale (sartd:fit-vp-by-zoom-all-then-snap vp))
            (if (not newScale)
              (setq stable T)
              (if (= (sartd:scale-int newScale) (sartd:scale-int finalScale))
                (setq stable T)
                (setq finalScale newScale))))
          (if finalScale
            (progn
              ; Final callout pass after the viewport scale has settled.
              (sartd:scale-generated-dims finalScale)
              (sartd:scale-generated-callouts finalScale)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (sartd:fit-vp-by-zoom-all-then-snap vp)
              (sartd:pr (strcat "Auto-fit complete: viewport zoom-all fitted and snapped to standard scale around 1:" (itoa (sartd:scale-int finalScale)) "."))))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL opens the sheet viewport, runs viewport fit, then sets CustomScale directly from the internal scale list; AutoCAD scale list is ignored."))
  (sartd:pr "Auto workflow 2 started: draw model, import sheet, zoom-fit viewport, update border.")
  (setq ok (sartd:safe-stage "Auto model draw" 'sartd:run-model-auto-0))
  (if ok (setq ok (sartd:safe-stage "PaperSpace sheet import" 'sartd:run-paper-auto-active)))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Viewport zoom-fit auto scale" 'sartd:run-autofit))))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Border update" 'sartd:run-border-auto-active))))
  (sartd:setvar-safe "REGENAUTO" 1)
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))

; No AutoCAD scale-list edits are made after overrides; internal list only.
(princ)


; =================================================================================================
; v0.9.9.4.3.23 OVERRIDES
; Fix SARTDALL viewport activation.
; Root cause found from testing: the previous viewport search could pick AutoCAD's paper-space
; background viewport (DXF 69 = 1), not the real floating MVIEW viewport. MSPACE then reported
; "There are no active Model space viewports." These overrides filter to real floating paper
; viewports only and add a direct-fit fallback if AutoCAD refuses to enter the viewport.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

(defun sartd:floating-pviewport-p (vp / en ed num w h name)
  (setq name (if vp (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list vp)))) ""))
  (if (/= name "ACDBVIEWPORT")
    nil
    (progn
      (setq en (vl-catch-all-apply 'vlax-vla-object->ename (list vp)))
      (if (vl-catch-all-error-p en)
        nil
        (progn
          (setq ed (entget en))
          (setq num (cdr (assoc 69 ed)))
          (setq w (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
          (setq h (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
          (and num (> (fix num) 1) (> w 5.0) (> h 5.0)))))))

(defun sartd:find-paper-viewports (objs / out obj)
  (setq out nil)
  (foreach obj objs
    (if (sartd:floating-pviewport-p obj)
      (setq out (append out (list obj)))))
  out)

(defun sartd:current-layout-paper-viewports (/ ps out obj)
  ; Real MVIEW/floating paper viewports only. Ignores AutoCAD's paper-space background viewport.
  (setq out nil)
  (setq ps (sartd:paperspace))
  (vlax-for obj ps
    (if (sartd:floating-pviewport-p obj)
      (setq out (append out (list obj)))))
  out)

(defun sartd:layout-paper-viewports (layoutName / doc layouts lay blk out obj)
  ; Reads only real floating viewports from a named PaperSpace layout.
  (setq out nil)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layouts (vla-get-Layouts doc))
  (if (and layoutName (/= (sartd:str layoutName) ""))
    (progn
      (setq lay (vl-catch-all-apply 'vla-Item (list layouts layoutName)))
      (if (not (vl-catch-all-error-p lay))
        (progn
          (setq blk (vl-catch-all-apply 'vla-get-Block (list lay)))
          (if (not (vl-catch-all-error-p blk))
            (vlax-for obj blk
              (if (sartd:floating-pviewport-p obj)
                (setq out (append out (list obj))))))))))
  out)

(defun sartd:auto-viewport-from-current-layout (/ vps vp)
  ; Returns the only real floating viewport, or the largest real floating viewport.
  (setq vps (sartd:current-layout-paper-viewports))
  (cond
    ((null vps) nil)
    ((= (length vps) 1) (car vps))
    (T (sartd:largest-viewport vps))))

(defun sartd:activate-paper-viewport-modelspace (vp / doc n r ok)
  ; Activates the supplied real PaperSpace floating viewport.
  ; Returns T only when AutoCAD has actually entered floating ModelSpace for that viewport.
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq ok nil)
  (if (and vp (sartd:floating-pviewport-p vp))
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq n (sartd:vp-number vp))
      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
      (vl-catch-all-apply 'vla-Update (list vp))
      (vl-catch-all-apply 'vla-put-ActiveSpace (list doc 1))
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
      (vl-catch-all-apply 'vla-put-ActivePViewport (list doc vp))
      (setq r (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-true)))
      (if (and (not (vl-catch-all-error-p r)) (/= (getvar "CVPORT") 1))
        (setq ok T))
      ; Fallback: if ActivePViewport did not open it, try selecting by CVPORT number.
      (if (and (not ok) n)
        (progn
          (vl-catch-all-apply 'setvar (list "CVPORT" n))
          (if (/= (getvar "CVPORT") 1) (setq ok T))))
      ; Final fallback: AutoCAD command, after ActivePViewport has already been set.
      (if (not ok)
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.MSPACE"))
          (if (/= (getvar "CVPORT") 1) (setq ok T))))))
  ok)

(defun sartd:direct-fit-vp-from-last-extents (vp / ext ph pw ll ur mw mh ratio scale midx midy)
  ; Fallback if AutoCAD refuses to enter the viewport. It uses the generated model extents directly
  ; and sets the viewport CustomScale/ViewCenter without MSPACE/ZOOM.
  (setq scale nil)
  (setq ext (sartd:last-extents))
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ll (car ext))
      (setq ur (cadr ext))
      (if (and (> ph 0.0) (> pw 0.0) ll ur)
        (progn
          (setq mw (abs (- (car ur) (car ll))))
          (setq mh (abs (- (cadr ur) (cadr ll))))
          (setq ratio (* 1.05 (max (/ mw pw) (/ mh ph))))
          (setq scale (sartd:choose-scale ratio))
          (setq midx (/ (+ (car ll) (car ur)) 2.0))
          (setq midy (/ (+ (cadr ll) (cadr ur)) 2.0))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:pr (strcat "Viewport direct-fit fallback used. Generated extents snapped to 1:" (itoa scale) "."))))))
  scale)

(defun sartd:fit-vp-by-zoom-all-then-snap (vp / ph vh raw scale ctr ctrx ctry ok)
  ; v0.9.9.4.3.23: uses only real floating MVIEW viewports. First tries to enter the viewport
  ; and run AutoCAD ZOOM All. If AutoCAD refuses MSPACE, falls back to generated extents fitting.
  (setq scale nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (if (<= ph 0.0)
        nil
        (progn
          (setq ok (sartd:activate-paper-viewport-modelspace vp))
          (if ok
            (progn
              (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_A"))
              (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
              (if (<= vh 0.0) (setq vh (sartd:num (getvar "VIEWSIZE") 0.0)))
              (setq ctr (getvar "VIEWCTR"))
              (if (and (listp ctr) (>= (length ctr) 2))
                (progn (setq ctrx (car ctr)) (setq ctry (cadr ctr)))
                (progn
                  (setq ctr (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))
                  (setq ctr (sartd:to-list ctr))
                  (setq ctrx (if ctr (car ctr) 0.0))
                  (setq ctry (if (and ctr (cadr ctr)) (cadr ctr) 0.0))))
              (setq raw (if (> ph 0.0) (/ vh ph) sartd:*default-callout-scale*))
              (if (< raw 1.0) (setq raw sartd:*default-callout-scale*))
              (setq scale (sartd:choose-scale raw))
              (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
              (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt ctrx ctry 0.0)))
              (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
              (setq sartd:*last-viewport-scale* scale)
              (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
              (sartd:deactivate-viewport-to-paperspace)
              (sartd:pr (strcat "Viewport zoom-all raw fit approx 1:" (itoa (sartd:scale-int raw)) ", snapped to 1:" (itoa scale) ".")))
            (progn
              (sartd:deactivate-viewport-to-paperspace)
              (sartd:pr "AutoCAD would not enter the floating viewport; using generated-extents direct fit instead.")
              (setq scale (sartd:direct-fit-vp-from-last-extents vp))))))))
  scale)

(princ)

; =================================================================================================
; v0.9.9.4.3.23 OVERRIDES
; Purpose:
;   Finalise SARTDALL sequence as discussed:
;   Active Excel -> draw model -> import official sheet -> update annotations -> auto-space views
;   -> fit the sheet viewport using generated extents equivalent to viewport Zoom All
;   -> snap to the next safer internal standard scale -> rescale model annotations
;   -> update border -> lock viewport.
;
; Note:
;   AutoCAD refused to enter the imported floating viewport reliably on some Sarens profiles, giving
;   "There are no active Model space viewports." This override no longer depends on simulated double
;   clicking/MSPACE. It calculates the same raw fit scale that ZOOM ALL would produce for the
;   generated model extents inside the viewport, then applies ViewCenter/ViewHeight/CustomScale directly.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

; Much longer internal-only scale list. The AutoCAD scale dropdown is not modified.
(setq sartd:*standard-scale-denominators*
  '(1 2 3 4 5 6 8 10 12 15 16 18 20 22 25 30 33 35 40 45 50 55 60 65 70 75 80 85 90 95
    100 110 120 125 130 140 150 160 175 180 190 200 210 225 240 250 260 275 300 320 333
    350 375 400 425 450 475 500 550 600 650 700 750 800 850 900 950 1000 1100 1200 1250
    1300 1400 1500 1600 1750 1800 1900 2000 2250 2500 2750 3000 3500 4000 4500 5000
    6000 7500 10000))

(defun sartd:choose-scale (ratio / scales out s target maxScale)
  ; ratio is required model units per paper unit. Pick the first internal standard scale denominator
  ; greater than or equal to the raw fit requirement. Example: raw 169 -> 175.
  (setq scales sartd:*standard-scale-denominators*)
  (setq target (max 1.0 (* 1.02 (sartd:num ratio 200.0)))) ; 2% safety margin against cropping
  (setq maxScale (if scales (car (last scales)) 10000))
  (setq out maxScale)
  (foreach s scales
    (if (and (= out maxScale) (>= (float s) target))
      (setq out s)))
  (sartd:scale-int out))

(defun sartd:scale-int (v / n)
  ; v0.9.9.4.3.23: allow the longer internal scale range up to 1:10000.
  (setq n (fix (+ 0.5 (abs (sartd:num v sartd:*default-callout-scale*)))))
  (if (< n 1) (setq n (fix sartd:*default-callout-scale*)))
  (if (> n 10000) (setq n 10000))
  n)

(defun sartd:fit-vp-direct-from-extents (vp ext / pw ph ll ur mw mh raw scale midx midy)
  ; Direct equivalent of opening the viewport and using Zoom All/Extents, but without needing MSPACE.
  ; Uses the current generated model extents and the PaperSpace viewport width/height to determine
  ; the raw non-standard scale, then snaps upward to the next internal standard scale.
  (setq scale nil)
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq ll (car ext))
      (setq ur (cadr ext))
      (if (and (> pw 0.0) (> ph 0.0) ll ur)
        (progn
          (setq mw (max 1.0 (abs (- (car ur) (car ll)))))
          (setq mh (max 1.0 (abs (- (cadr ur) (cadr ll)))))
          ; 5% view margin inside the viewport so the drawing is not tight to the viewport boundary.
          (setq raw (* 1.05 (max (/ mw pw) (/ mh ph))))
          (setq scale (sartd:choose-scale raw))
          (setq midx (/ (+ (car ll) (car ur)) 2.0))
          (setq midy (/ (+ (cadr ll) (cadr ur)) 2.0))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
          (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
          (vl-catch-all-apply 'vla-put-Layer (list vp sartd:*layer-viewport*))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale))))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (vl-catch-all-apply 'vla-Update (list vp))
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
          (sartd:pr (strcat "Viewport direct fit raw approx 1:" (itoa (sartd:scale-int raw)) " -> selected 1:" (itoa scale) "."))))))
  scale)

(defun sartd:fit-vp-by-zoom-all-then-snap (vp / ext scale)
  ; v0.9.9.4.3.23: stable direct fit. This intentionally avoids cursor control and MSPACE because
  ; AutoCAD profile/layout state has proven unreliable for automated viewport activation.
  (setq ext (sartd:last-extents))
  (setq scale (sartd:fit-vp-direct-from-extents vp ext))
  (if (not scale)
    (sartd:pr "Viewport fit failed: no valid floating viewport or generated extents were found."))
  scale)

(defun sartd:run-autofit (/ vp target initialScale chosenScale ext data passScale finalScale)
  ; Final staged autofit:
  ; 1) activate layout; 2) find real floating viewport; 3) redraw spaced at a provisional scale;
  ; 4) fit viewport from generated extents; 5) redraw once at chosen scale; 6) final fit/lock.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))

          ; Provisional redraw at current/default scale to get sensible dimensions and extents.
          (sartd:auto-redraw-spaced-at-scale initialScale)
          (setq ext (sartd:last-extents))
          (setq chosenScale (sartd:fit-vp-direct-from-extents vp ext))
          (if (not chosenScale) (setq chosenScale initialScale))

          ; Redraw with the selected scale because dim gaps/text sizes affect the final extents.
          (setq passScale (sartd:scale-int chosenScale))
          (sartd:auto-redraw-spaced-at-scale passScale)
          (setq ext (sartd:last-extents))
          (setq finalScale (sartd:fit-vp-direct-from-extents vp ext))
          (if (not finalScale) (setq finalScale passScale))

          ; One last callout scale pass and final viewport fit/lock.
          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          (setq ext (sartd:last-extents))
          (sartd:fit-vp-direct-from-extents vp ext)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: views spaced, viewport centred, snapped to internal scale 1:" (itoa (sartd:scale-int finalScale)) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok layoutName)
  ; SARTDALL final sequence.
  (vl-load-com)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL final sequence: Active Excel -> draw model -> import sheet -> update annotations -> auto-fit viewport -> update border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (setq ok T)

  ; 1/2. Active Excel + draw ModelSpace arrangement at 0,0.
  (setq ok (sartd:safe-stage "ModelSpace draw from Active Excel at 0,0" 'sartd:run-model-auto-active))

  ; 3. Import official PaperSpace sheet.
  (if ok
    (setq ok (sartd:safe-stage "Official PaperSpace sheet import" 'sartd:run-paper-auto-active)))

  ; 4. Update PaperSpace annotation blocks before final viewport work.
  (if ok
    (progn
      (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
      (sartd:activate-paper-layout layoutName)
      (setq ok (sartd:safe-stage "PaperSpace annotation update" 'sartd:run-annotation-auto-active))))

  ; 5-12. Auto-space, fit viewport, snap to internal scale, rescale generated model callouts, lock viewport.
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Auto-space and viewport fit" 'sartd:run-autofit))))

  ; 13. Update Sarens border/title block.
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Sarens border/title block update" 'sartd:run-border-auto-active))))

  (sartd:setvar-safe "REGENAUTO" 1)
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)

; =================================================================================================
; v0.9.9.4.3.28 OVERRIDES
; Fixes:
;   - SARTDALL called sartd:run-model-auto-active, which did not exist in v0.9.9.4.3.23.
;     This now wraps the proven sartd:run-model-auto-0 routine.
;   - Viewport direct fit now explicitly applies ViewCenter from the final generated extents.
;   - Scale is selected from the raw fit requirement, snapped upward to the internal standard list.
;   - After dimension/text/block scaling, SARTDAUTOFIT performs a second centre pass.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

(defun sartd:run-model-auto-active ()
  ; v0.9.9.4.3.28: compatibility wrapper for SARTDALL final sequence.
  ; The actual stable auto model draw routine is sartd:run-model-auto-0.
  (sartd:run-model-auto-0))

(defun sartd:ext-centre (ext / ll ur)
  (if (and ext (car ext) (cadr ext))
    (progn
      (setq ll (car ext))
      (setq ur (cadr ext))
      (list (/ (+ (car ll) (car ur)) 2.0)
            (/ (+ (cadr ll) (cadr ur)) 2.0)))
    nil))

(defun sartd:raw-fit-scale-from-extents (vp ext / pw ph ll ur mw mh raw)
  ; Returns raw required scale denominator from model extents and PaperSpace viewport size.
  ; Example return 169.0 means approx 1:169 is required to fit.
  (setq raw nil)
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq ll (car ext))
      (setq ur (cadr ext))
      (if (and (> pw 0.0) (> ph 0.0) ll ur)
        (progn
          (setq mw (max 1.0 (abs (- (car ur) (car ll)))))
          (setq mh (max 1.0 (abs (- (cadr ur) (cadr ll)))))
          ; 5% paper margin, matching the manual viewport zoom-all plus a small safety margin.
          (setq raw (* 1.05 (max (/ mw pw) (/ mh ph)))))))
  raw)
)

(defun sartd:apply-viewport-centre-scale (vp ext scale / ctr ph midx midy)
  ; Applies CustomScale and ViewCenter. The centre is always based on final generated model extents.
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq scale (sartd:scale-int scale))
      (setq ctr (sartd:ext-centre ext))
      (if ctr
        (progn
          (setq midx (car ctr))
          (setq midy (cadr ctr))
          (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
          (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
          (vl-catch-all-apply 'vla-put-Layer (list vp sartd:*layer-viewport*))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (if (> ph 0.0)
            (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale)))))
          ; Set ViewCenter, then ViewTarget, then ViewCenter again. Some AutoCAD profiles update target
          ; and centre in a different order, so this double pass keeps the final centre reliable.
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vla-Update (list vp))
          T)
        nil))
    nil))

(defun sartd:fit-vp-direct-from-extents (vp ext / raw scale ctr)
  ; v0.9.9.4.3.28: direct viewport fit, centred from generated model extents.
  ; This copies the useful part of viewport Zoom All/Extents without needing to enter MSPACE.
  (setq scale nil)
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq raw (sartd:raw-fit-scale-from-extents vp ext))
      (if raw
        (progn
          (setq scale (sartd:choose-scale raw))
          (sartd:apply-viewport-centre-scale vp ext scale)
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (vl-catch-all-apply 'vla-Update (list vp))
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
          (sartd:pr (strcat "Viewport direct fit raw approx 1:" (itoa (sartd:scale-int raw)) " -> selected 1:" (itoa scale) "; ViewCenter set to final extents centre."))))))
  scale)

(defun sartd:run-autofit (/ vp target initialScale chosenScale ext passScale finalScale raw)
  ; v0.9.9.4.3.28:
  ; 1) activate layout; 2) find real floating viewport; 3) redraw spaced at provisional scale;
  ; 4) calculate raw fit and snap to internal standard scale; 5) redraw at chosen scale;
  ; 6) second centre pass after dimension/block/text scaling; 7) lock viewport.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))

          ; First redraw at existing/default scale to establish a known spaced layout.
          (sartd:auto-redraw-spaced-at-scale initialScale)
          (setq ext (sartd:last-extents))
          (setq raw (sartd:raw-fit-scale-from-extents vp ext))
          (setq chosenScale (if raw (sartd:choose-scale raw) initialScale))

          ; Redraw at the chosen scale because dim spacing/text size affects extents.
          (setq passScale (sartd:scale-int chosenScale))
          (sartd:auto-redraw-spaced-at-scale passScale)
          (setq ext (sartd:last-extents))
          (setq finalScale (sartd:fit-vp-direct-from-extents vp ext))
          (if (not finalScale) (setq finalScale passScale))

          ; Second centre pass after dimensions, COGs, coordinate symbols and ground blocks have been scaled.
          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          (setq ext (sartd:last-extents))
          (sartd:apply-viewport-centre-scale vp ext finalScale)
          (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
          (vl-catch-all-apply 'vla-Update (list vp))
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: raw scale snapped to 1:" (itoa (sartd:scale-int finalScale)) ", final extents centred in viewport."))))))
  (princ))

(princ)


; =================================================================================================
; v0.9.9.4.3.28 OVERRIDES
; Purpose:
;   Explicitly unlock the PaperSpace viewport before any viewport fit / zoom-equivalent operation,
;   temporarily unlock the viewport layer if required, then lock the viewport again after fitting.
;   This prevents locked viewport state from blocking CustomScale/ViewCenter/ViewHeight updates.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

(defun sartd:vbool (v)
  (or (= v :vlax-true) (= v T) (= v 1)))

(defun sartd:layer-object (layerName / doc lays lay)
  (setq lay nil)
  (if (and layerName (/= (sartd:str layerName) ""))
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq lays (vla-get-Layers doc))
      (setq lay (vl-catch-all-apply 'vla-Item (list lays layerName)))
      (if (vl-catch-all-error-p lay) (setq lay nil))))
  lay)

(defun sartd:viewport-layer-name (vp / lay)
  (setq lay nil)
  (if vp
    (progn
      (setq lay (vl-catch-all-apply 'vla-get-Layer (list vp)))
      (if (vl-catch-all-error-p lay) (setq lay sartd:*layer-viewport*))))
  (if (or (not lay) (= (sartd:str lay) "")) sartd:*layer-viewport* lay))

(defun sartd:unlock-vp-layer-for-fit (vp / lname lay old)
  ; Returns (layerName oldLockState). If no layer is found, returns nil.
  (setq lname (sartd:viewport-layer-name vp))
  (setq lay (sartd:layer-object lname))
  (if lay
    (progn
      (setq old (sartd:vbool (vl-catch-all-apply 'vla-get-Lock (list lay))))
      (if old (vl-catch-all-apply 'vla-put-Lock (list lay :vlax-false)))
      (list lname old))
    nil))

(defun sartd:restore-vp-layer-after-fit (state / lay)
  ; Only relocks if the layer was locked before the fit.
  (if (and state (cadr state))
    (progn
      (setq lay (sartd:layer-object (car state)))
      (if lay (vl-catch-all-apply 'vla-put-Lock (list lay :vlax-true)))))
  T)

(defun sartd:unlock-viewport-for-fit (vp / state wasLocked)
  ; Returns (layerState displayWasLocked).
  (setq state (sartd:unlock-vp-layer-for-fit vp))
  (setq wasLocked nil)
  (if vp
    (progn
      (setq wasLocked (sartd:vbool (vl-catch-all-apply 'vlax-get-property (list vp 'DisplayLocked))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
      (vl-catch-all-apply 'vla-Update (list vp))))
  (list state wasLocked))

(defun sartd:finish-viewport-fit (vp state / layerState)
  ; Final state for SARTD drawings: viewport display locked, original layer lock restored.
  (setq layerState (car state))
  (if vp
    (progn
      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
      (vl-catch-all-apply 'vla-Update (list vp))))
  (sartd:restore-vp-layer-after-fit layerState)
  T)

(defun sartd:apply-viewport-centre-scale (vp ext scale / state ctr ph midx midy)
  ; v0.9.9.4.3.28: explicitly unlock viewport/layer before applying scale and ViewCenter.
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq scale (sartd:scale-int scale))
      (setq ctr (sartd:ext-centre ext))
      (if ctr
        (progn
          (setq midx (car ctr))
          (setq midy (cadr ctr))
          (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
          (vl-catch-all-apply 'vla-put-Layer (list vp sartd:*layer-viewport*))
          (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
          (if (> ph 0.0)
            (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale)))))
          ; Double-centre pass to imitate the centring effect of viewport Zoom All.
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt midx midy 0.0)))
          (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt midx midy)))
          (sartd:finish-viewport-fit vp state)
          T)
        (progn
          (sartd:finish-viewport-fit vp state)
          nil)))
    nil))

(defun sartd:fit-vp-direct-from-extents (vp ext / raw scale state)
  ; v0.9.9.4.3.28: unlock viewport before raw-fit scale/centre pass, then lock it again.
  (setq scale nil)
  (if (and vp ext (sartd:floating-pviewport-p vp))
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq raw (sartd:raw-fit-scale-from-extents vp ext))
      (if raw
        (progn
          (setq scale (sartd:choose-scale raw))
          ; apply-viewport-centre-scale performs its own safe unlock/finish, but the early unlock here
          ; guarantees the raw-fit stage is not blocked by a locked viewport/layer.
          (sartd:apply-viewport-centre-scale vp ext scale)
          (sartd:finish-viewport-fit vp state)
          (setq sartd:*last-viewport-scale* scale)
          (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
          (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
          (sartd:pr (strcat "Viewport direct fit unlocked first; raw approx 1:" (itoa (sartd:scale-int raw)) " -> selected 1:" (itoa scale) "; final ViewCenter applied.")))
        (sartd:finish-viewport-fit vp state))))
  scale)

(defun sartd:run-autofit (/ vp target initialScale chosenScale ext passScale finalScale raw state)
  ; v0.9.9.4.3.28 sequence:
  ; activate layout -> find viewport -> unlock viewport/layer -> redraw spaced -> raw fit -> snap scale
  ; -> redraw at final scale -> second centre pass -> lock viewport again.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq state (sartd:unlock-viewport-for-fit vp))
          (sartd:pr "Viewport unlocked for auto-fit scale/centre pass.")
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))

          (sartd:auto-redraw-spaced-at-scale initialScale)
          (setq ext (sartd:last-extents))
          (setq raw (sartd:raw-fit-scale-from-extents vp ext))
          (setq chosenScale (if raw (sartd:choose-scale raw) initialScale))

          (setq passScale (sartd:scale-int chosenScale))
          (sartd:auto-redraw-spaced-at-scale passScale)
          (setq ext (sartd:last-extents))
          (setq finalScale (sartd:fit-vp-direct-from-extents vp ext))
          (if (not finalScale) (setq finalScale passScale))

          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          (setq ext (sartd:last-extents))
          (sartd:apply-viewport-centre-scale vp ext finalScale)
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: viewport unlocked, raw scale snapped to 1:" (itoa (sartd:scale-int finalScale)) ", final extents centred, viewport locked."))))))
  (princ))

(princ)


; =================================================================================================
; v0.9.9.4.3.28 FINAL OVERRIDES
; Purpose:
;   SARTDALL viewport fit now follows the user-confirmed AutoCAD sequence:
;     _.MSPACE -> ZOOM -> All
;   The raw fit scale is then read from the viewport, snapped upward to the internal long scale list,
;   applied using CustomScale, and the viewport is locked again.
;   The auto workflow order is corrected:
;     Active Excel -> draw model -> import sheet -> activate layout -> auto-space/final viewport fit
;     -> update annotation blocks -> update border -> lock viewport.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

; Much longer internal scale list. These are not added to the AutoCAD scale list.
(setq sartd:*standard-scale-denominators*
  '(1 2 4 5 8 10 12 15 16 20 25 30 33 40 50 60 75 80 90
    100 110 125 150 175 200 225 250 275 300 333 350 375 400 450
    500 550 600 650 700 750 800 900 1000 1100 1200 1250 1300 1400
    1500 1600 1750 1800 2000 2250 2500 2750 3000 3500 4000 4500
    5000 6000 7500 10000))

(defun sartd:paper-layout-active-p ()
  (and (= (getvar "TILEMODE") 0) (= (getvar "CVPORT") 1)))

(defun sartd:safe-set-cvport (n / r)
  (setq r nil)
  (if (and n (> (fix n) 1))
    (progn
      (setq r (vl-catch-all-apply 'setvar (list "CVPORT" (fix n))))
      (not (vl-catch-all-error-p r)))
    nil))

(defun sartd:enter-viewport-modelspace (vp / doc n ok r)
  ; Enter the exact floating viewport, equivalent to double-clicking inside its boundary.
  ; Returns T only if CVPORT becomes the viewport number / floating ModelSpace is active.
  (setq ok nil)
  (if (and vp (sartd:floating-pviewport-p vp))
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq n (sartd:vp-number vp))
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (vl-catch-all-apply 'setvar (list "TILEMODE" 0))
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
      (vl-catch-all-apply 'setvar (list "CVPORT" 1))
      (vl-catch-all-apply 'vlax-put-property (list vp 'DisplayLocked :vlax-false))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Display :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewportOn :vlax-true))
      (vl-catch-all-apply 'vla-Update (list vp))
      ; Tell AutoCAD this is the active floating viewport, then enter ModelSpace.
      (vl-catch-all-apply 'vla-put-ActivePViewport (list doc vp))
      (setq r (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-true)))
      (if (and (not (vl-catch-all-error-p r)) (/= (getvar "CVPORT") 1))
        (setq ok T))
      ; If ActivePViewport did not enter it, force the real DXF CVPORT number.
      (if (and (not ok) n)
        (progn
          (sartd:safe-set-cvport n)
          (if (= (getvar "CVPORT") (fix n)) (setq ok T))))
      ; Last command fallback, matching the manual command sequence.
      (if (not ok)
        (progn
          (vl-catch-all-apply 'vla-put-ActivePViewport (list doc vp))
          (vl-catch-all-apply 'vl-cmdf (list "_.MSPACE"))
          (if (and n (= (getvar "CVPORT") (fix n))) (setq ok T))
          (if (and (not ok) (/= (getvar "CVPORT") 1)) (setq ok T))))))
  ok)

(defun sartd:zoom-all-read-viewport (vp / ph vh cs raw ctr scale ok)
  ; Must be called after the viewport is active in floating ModelSpace.
  ; Runs the exact command requested by the user:
  ;   _.ZOOM  _All
  ; Then reads the raw non-standard fit scale.
  (setq raw nil)
  (setq scale nil)
  (if (and vp (/= (getvar "CVPORT") 1))
    (progn
      (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_A"))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
      (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
      ; Prefer the viewport's CustomScale after Zoom All; fall back to ViewHeight / paper height.
      (cond
        ((> cs 0.0) (setq raw (/ 1.0 cs)))
        ((and (> ph 0.0) (> vh 0.0)) (setq raw (/ vh ph)))
        (T (setq raw nil)))
      (if (and raw (> raw 0.0))
        (setq scale (sartd:choose-scale raw)))
      (list raw scale))))

(defun sartd:apply-viewport-scale-preserve-zoom-centre (vp scale / ph ctrx ctry ctr)
  ; After Zoom All has centred the view, preserve the current viewport centre and apply clean CustomScale.
  (if (and vp scale)
    (progn
      (setq ctr (getvar "VIEWCTR"))
      (if (and (listp ctr) (>= (length ctr) 2))
        (progn (setq ctrx (car ctr)) (setq ctry (cadr ctr)))
        (progn
          (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter))))
          (setq ctrx (if ctr (car ctr) 0.0))
          (setq ctry (if (and ctr (cadr ctr)) (cadr ctr) 0.0))))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
      (if (> ph 0.0)
        (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale)))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt ctrx ctry 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
      (setq sartd:*last-viewport-scale* (sartd:scale-int scale))
      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa (sartd:scale-int scale)))
      (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
      T)
    nil))

(defun sartd:fit-viewport-by-mspace-zoom-all (vp / state raw scale result passScale ext finalResult)
  ; Unlock, enter viewport, run Zoom All, read raw fit scale, snap up to internal list,
  ; redraw at that chosen scale, then repeat Zoom All once for the final view.
  (setq scale nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (if (not (sartd:enter-viewport-modelspace vp))
        (progn
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr "Could not activate the PaperSpace viewport for _.MSPACE / ZOOM All. Falling back to extents calculation.")
          (setq ext (sartd:last-extents))
          (setq scale (sartd:fit-vp-direct-from-extents vp ext)))
        (progn
          ; First pass: mimic manual viewport fit.
          (setq result (sartd:zoom-all-read-viewport vp))
          (setq raw (if result (car result) nil))
          (setq scale (if result (cadr result) nil))
          (if (not scale) (setq scale sartd:*default-callout-scale*))
          (sartd:apply-viewport-scale-preserve-zoom-centre vp scale)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport _.MSPACE / ZOOM All raw fit approx 1:"
                            (itoa (sartd:scale-int (if raw raw scale)))
                            ", snapped to 1:" (itoa (sartd:scale-int scale)) "."))))))
  (sartd:scale-int (if scale scale sartd:*default-callout-scale*)))

(defun sartd:run-autofit (/ vp target initialScale chosenScale secondScale state)
  ; v0.9.9.4.3.28:
  ; 1. Activate PaperSpace layout.
  ; 2. Find the real floating viewport.
  ; 3. Redraw model views at a provisional scale.
  ; 4. Enter viewport with _.MSPACE and run _.ZOOM _All.
  ; 5. Read raw fit scale and snap upward to internal list.
  ; 6. Redraw at chosen scale, repeat viewport Zoom All once, scale callouts, lock viewport.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          (sartd:auto-redraw-spaced-at-scale initialScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq chosenScale (sartd:fit-viewport-by-mspace-zoom-all vp))
          ; Redraw at the chosen scale because dimension spacing/text size changes the extents.
          (sartd:auto-redraw-spaced-at-scale chosenScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq secondScale (sartd:fit-viewport-by-mspace-zoom-all vp))
          ; If second pass required a coarser scale, redraw once more at that scale and fit again.
          (if (/= (sartd:scale-int secondScale) (sartd:scale-int chosenScale))
            (progn
              (setq chosenScale secondScale)
              (sartd:auto-redraw-spaced-at-scale chosenScale)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (setq secondScale (sartd:fit-viewport-by-mspace-zoom-all vp))))
          (setq chosenScale (sartd:scale-int secondScale))
          (sartd:scale-generated-dims chosenScale)
          (sartd:scale-generated-callouts chosenScale)
          ; Final preserve-centre scale pass and lock.
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (if vp
            (progn
              (setq state (sartd:unlock-viewport-for-fit vp))
              (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float chosenScale))))
              (sartd:finish-viewport-fit vp state)))
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: viewport fitted by _.MSPACE / ZOOM All and snapped to internal scale 1:"
                            (itoa (sartd:scale-int chosenScale)) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok layoutName)
  (vl-load-com)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL sequence: Active Excel -> draw model -> import sheet -> activate layout -> auto-space -> _.MSPACE/ZOOM All fit -> update annotations -> update border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (setq ok T)

  (setq ok (sartd:safe-stage "ModelSpace draw from Active Excel at 0,0" 'sartd:run-model-auto-active))

  (if ok
    (setq ok (sartd:safe-stage "Official PaperSpace sheet import" 'sartd:run-paper-auto-active)))

  (if ok
    (progn
      (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
      (sartd:activate-paper-layout layoutName)
      (setq ok (sartd:safe-stage "Auto-space and viewport _.MSPACE / ZOOM All fit" 'sartd:run-autofit))))

  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "PaperSpace annotation update" 'sartd:run-annotation-auto-active))))

  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Sarens border/title block update" 'sartd:run-border-auto-active))))

  (sartd:setvar-safe "REGENAUTO" 1)
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; =================================================================================================
; v0.9.9.4.3.28 FINAL OVERRIDES
; Purpose:
;   Fix SARTDALL after the user confirmed _.MSPACE / _.ZOOM _All worked but the follow-up
;   scale snap was not being applied. This version:
;     - runs _.MSPACE then _.ZOOM _All inside the floating viewport;
;     - reads the raw fitted scale from VIEWSIZE / viewport paper height;
;     - snaps upward to the long internal SARTD scale list;
;     - applies CustomScale directly;
;     - scales dimensions/text/COGs/ground blocks to that chosen scale;
;     - does NOT run the annotation update again after SARTDP.
;   Border = Sarens drawing border/title block update only.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.28")

(defun sartd:viewport-raw-scale-after-zoom-all (vp / ph vs cs raw)
  ; Must be called while inside the floating viewport after _.ZOOM _All.
  ; Primary raw denominator = VIEWSIZE / PaperSpace viewport height.
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (setq vs (sartd:num (getvar "VIEWSIZE") 0.0))
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (setq raw nil)
  (cond
    ((and (> ph 0.0) (> vs 0.0)) (setq raw (/ vs ph)))
    ((> cs 0.0) (setq raw (/ 1.0 cs)))
    (T (setq raw nil)))
  raw)

(defun sartd:apply-viewport-scale-and-centre (vp scale ctr / ph cx cy)
  ; Apply clean scale while preserving the centre produced by AutoCAD Zoom All.
  (if (and vp scale ctr)
    (progn
      (setq cx (car ctr))
      (setq cy (cadr ctr))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float scale))))
      (if (> ph 0.0)
        (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float scale)))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (setq sartd:*last-viewport-scale* (sartd:scale-int scale))
      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa (sartd:scale-int scale)))
      (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
      T)
    nil))

(defun sartd:fit-viewport-by-real-zoom-all-then-snap (vp / state ok raw scale ctr result)
  ; Exact user-required viewport stage:
  ;   _.MSPACE
  ;   _.ZOOM
  ;   _All
  ; Then read raw scale, snap up, apply CustomScale, scale generated callouts.
  (setq scale nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if (not ok)
        (progn
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr "Could not enter the floating viewport for _.MSPACE / _.ZOOM _All."))
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:viewport-raw-scale-after-zoom-all vp))
          (setq ctr (getvar "VIEWCTR"))
          (if (not (and (listp ctr) (>= (length ctr) 2)))
            (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
          (if (and raw (> raw 0.0))
            (setq scale (sartd:choose-scale raw))
            (setq scale sartd:*default-callout-scale*))
          (sartd:apply-viewport-scale-and-centre vp scale ctr)
          (sartd:deactivate-viewport-to-paperspace)
          ; Now scale the generated model-space annotation/callout items to match the chosen scale.
          (sartd:scale-generated-dims scale)
          (sartd:scale-generated-callouts scale)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport fitted with _.MSPACE / _.ZOOM _All: raw approx 1:"
                            (itoa (sartd:scale-int (if raw raw scale)))
                            " -> applied CustomScale 1:" (itoa (sartd:scale-int scale))
                            ". Dims/text/COGs/ground scaled to 1:" (itoa (sartd:scale-int scale)) "."))))))
  (sartd:scale-int (if scale scale sartd:*default-callout-scale*)))

(defun sartd:run-autofit (/ vp target initialScale chosenScale secondScale)
  ; v0.9.9.4.3.28 order:
  ;   activate layout -> find real viewport -> auto-space/redraw -> _.MSPACE/_.ZOOM _All -> read raw
  ;   -> snap/apply CustomScale -> redraw at chosen scale -> repeat fit once -> final scale callouts.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          (sartd:auto-redraw-spaced-at-scale initialScale)

          ; First real viewport fit.
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq chosenScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))

          ; Redraw at the chosen scale because dimension spacing/text size affects extents.
          (sartd:auto-redraw-spaced-at-scale chosenScale)

          ; Second fit after redrawing/scaling, so the centre and scale are based on final geometry.
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))

          ; If the second pass needs a coarser scale, redraw/final-fit once more.
          (if (/= (sartd:scale-int secondScale) (sartd:scale-int chosenScale))
            (progn
              (setq chosenScale secondScale)
              (sartd:auto-redraw-spaced-at-scale chosenScale)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))))

          (setq chosenScale (sartd:scale-int secondScale))
          (sartd:scale-generated-dims chosenScale)
          (sartd:scale-generated-callouts chosenScale)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: viewport zoom-all fitted and snapped to 1:"
                            (itoa (sartd:scale-int chosenScale)) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok layoutName)
  (vl-load-com)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL order: Active Excel -> draw model -> import sheet -> auto-space -> _.MSPACE/_.ZOOM _All -> snap/apply scale -> update border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (setq ok T)

  (setq ok (sartd:safe-stage "ModelSpace draw from Active Excel at 0,0" 'sartd:run-model-auto-active))

  (if ok
    (setq ok (sartd:safe-stage "Official PaperSpace sheet import" 'sartd:run-paper-auto-active)))

  ; Do NOT run the annotation update again here. SARTDP/import already handles it.
  (if ok
    (progn
      (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
      (sartd:activate-paper-layout layoutName)
      (setq ok (sartd:safe-stage "Auto-space and viewport _.MSPACE / _.ZOOM _All fit" 'sartd:run-autofit))))

  ; Border = the Sarens drawing border/title block, not the trailer data annotation tables.
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "Sarens border/title block update" 'sartd:run-border-auto-active))))

  (sartd:setvar-safe "REGENAUTO" 1)
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)

; =================================================================================================
; v0.9.9.4.3.29 OVERRIDE
; Requested fixes:
;   - When SARTD sets a viewport CustomScale, add that scale to the drawing/layout scale list.
;   - Push the same final scale into the Sarens border/title block SCALE attribute.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.29")

(defun sartd:scale-denom-name (scale / den)
  (setq den (sartd:scale-int scale))
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:scale-denom-ratio (scale / den)
  (setq den (sartd:scale-int scale))
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:add-scale-via-activex (name denom / acad doc scales result)
  ; Some AutoCAD builds expose a Scales collection through ActiveX. If this build does not,
  ; this safely fails and the other methods below are tried.
  (setq result nil)
  (setq acad (vl-catch-all-apply 'vlax-get-acad-object nil))
  (if (not (vl-catch-all-error-p acad))
    (progn
      (setq doc (vl-catch-all-apply 'vla-get-ActiveDocument (list acad)))
      (if (not (vl-catch-all-error-p doc))
        (progn
          (setq scales (vl-catch-all-apply 'vla-get-Scales (list doc)))
          (if (not (vl-catch-all-error-p scales))
            (progn
              (setq result (vl-catch-all-apply 'vla-Add (list scales name 1.0 (float (sartd:scale-int denom)))))
              (if (not (vl-catch-all-error-p result)) T nil))
            nil))
        nil))
    nil))

(defun sartd:add-scale-via-command (name denom / oldcmdecho res)
  ; Fallback method. Only called after the scale-exists check says it is missing, to avoid
  ; AutoCAD's "Redefine scale?" prompt.
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq res
    (vl-catch-all-apply
      'vl-cmdf
      (list "_.-SCALELISTEDIT" "_Add" name (sartd:scale-denom-ratio denom) "_Exit")))
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (not (vl-catch-all-error-p res)))

(defun sartd:ensure-final-scale-in-layout-list (scale / den name ok)
  ; Adds the selected viewport scale to the drawing scale list, but does not rely on that list
  ; for fitting. Viewport scale is still applied directly through CustomScale.
  (setq den (sartd:scale-int scale))
  (setq name (sartd:scale-denom-name den))
  (cond
    ((or (not den) (<= den 0)) nil)
    ((sartd:scale-exists-p name)
      (sartd:pr (strcat "Viewport scale " name " already exists in the drawing scale list."))
      T)
    (T
      (setq ok (or
                 (sartd:add-scale-via-activex name den)
                 (sartd:add-scale-to-scalelist name den)
                 (sartd:add-scale-via-command name den)))
      (if ok
        (sartd:pr (strcat "Added viewport scale " name " to the drawing/layout scale list."))
        (sartd:pr (strcat "Warning: could not add viewport scale " name " to the AutoCAD scale list; viewport CustomScale was still set directly.")))
      ok)))

(defun sartd:set-last-viewport-scale-and-border-scale (scale / den)
  ; One place to store the final viewport scale so annotations and the border see the same value.
  (setq den (sartd:scale-int scale))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  (sartd:ensure-final-scale-in-layout-list den)
  den)

(defun sartd:current-border-scale-string (/ sc)
  ; v0.9.9.4.3.29: border SCALE attribute always follows final viewport scale.
  (setq sc (sartd:current-view-scale))
  (strcat "1:" (sartd:scale-denom->string sc)))

(defun sartd:apply-viewport-scale-and-centre (vp scale ctr / ph cx cy den)
  ; Apply clean scale while preserving the centre produced by AutoCAD Zoom All.
  ; v0.9.9.4.3.29 also adds the selected scale to the drawing scale list and stores it for border SCALE.
  (if (and vp scale ctr)
    (progn
      (setq den (sartd:set-last-viewport-scale-and-border-scale scale))
      (setq cx (car ctr))
      (setq cy (cadr ctr))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
      (if (> ph 0.0)
        (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
      T)
    nil))

(defun sartd:apply-viewport-scale-preserve-zoom-centre (vp scale / ph ctrx ctry ctr den)
  ; After Zoom All has centred the view, preserve the current viewport centre and apply clean CustomScale.
  ; v0.9.9.4.3.29 also adds the selected scale to the drawing scale list and stores it for border SCALE.
  (if (and vp scale)
    (progn
      (setq den (sartd:set-last-viewport-scale-and-border-scale scale))
      (setq ctr (getvar "VIEWCTR"))
      (if (and (listp ctr) (>= (length ctr) 2))
        (progn (setq ctrx (car ctr)) (setq ctry (cadr ctr)))
        (progn
          (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter))))
          (setq ctrx (if ctr (car ctr) 0.0))
          (setq ctry (if (and ctr (cadr ctr)) (cadr ctr) 0.0))))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
      (if (> ph 0.0)
        (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt ctrx ctry 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt ctrx ctry)))
      (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
      T)
    nil))

(defun sartd:fit-viewport-by-real-zoom-all-then-snap (vp / state ok raw scale ctr result den)
  ; Exact user-required viewport stage:
  ;   _.MSPACE
  ;   _.ZOOM
  ;   _All
  ; Then read raw scale, snap up, apply CustomScale, add the selected scale to scale list,
  ; and scale generated callouts.
  (setq scale nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if (not ok)
        (progn
          (sartd:finish-viewport-fit vp state)
          (sartd:pr "Could not activate the PaperSpace viewport for zoom-all fitting.")
          nil)
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:viewport-raw-scale-after-zoom-all vp))
          (setq ctr (getvar "VIEWCTR"))
          (if (not (and (listp ctr) (>= (length ctr) 2)))
            (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
          (if (and raw (> raw 0.0))
            (setq scale (sartd:choose-scale raw))
            (setq scale sartd:*default-callout-scale*))
          (setq den (sartd:set-last-viewport-scale-and-border-scale scale))
          (sartd:apply-viewport-scale-and-centre vp den ctr)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport fitted with _.MSPACE / _.ZOOM _All: raw approx 1:"
                            (itoa (sartd:scale-int (if raw raw den)))
                            " -> applied CustomScale 1:" (itoa den)
                            ". Scale added to list if missing; border SCALE = 1:" (itoa den) "."))
          den)))))

(defun sartd:run-border-auto-active (/ oldauto data result)
  ; v0.9.9.4.3.29: ensure the border/title block SCALE attribute receives the final viewport scale.
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (sartd:read-data))
  (setq sartd:*auto-excel-source* oldauto)
  (if data
    (progn
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Auto Sarens border update failed: " (vl-catch-all-error-message result)))
        (sartd:pr (strcat "Sarens border/title block updated using viewport scale " (sartd:current-border-scale-string) "."))))))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; ============================================================================
; v0.9.9.4.3.30 FINAL STABILITY OVERRIDE
; - Fixes SARTDALL stopping at Sarens border/title block update.
; - Border update now uses saved final viewport scale automatically and cannot
;   break the command stack if one border field fails.
; - Adds clear diagnostics for raw/applied scale and border SCALE value.
; ============================================================================
(setq sartd:*version* "0.9.9.4.3.30")

(defun sartd:final-scale-denom (/ v)
  ; Returns the final viewport denominator used by SARTDALL.
  ; Falls back safely to 1:200 if nothing has been saved yet.
  (setq v (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0))
  (cond
    ((> v 0.0) (sartd:scale-int v))
    ((and (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale*) (sartd:scale-int sartd:*last-viewport-scale*))
    (T (sartd:scale-int sartd:*default-callout-scale*))))

(defun sartd:current-border-scale-string (/ den)
  ; Border SCALE must always follow the final fitted viewport scale.
  (setq den (sartd:final-scale-denom))
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:update-border-scale-only (/ ps obj total nm amap r)
  ; Fallback safety net: if the full border update errors, at least write the
  ; final fitted scale into SAR_Border_Project without stopping SARTDALL.
  (setq total 0)
  (setq amap (sartd:border-scale-map))
  (setq r (vl-catch-all-apply 'sartd:go-paperspace '()))
  (setq r (vl-catch-all-apply 'sartd:paperspace '()))
  (if (not (vl-catch-all-error-p r))
    (progn
      (setq ps r)
      (vlax-for obj ps
        (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
          (progn
            (setq nm (strcase (sartd:block-effective-name obj)))
            (if (= nm "SAR_BORDER_PROJECT")
              (setq total (+ total (sartd:set-block-attributes obj amap)))))))))
  (if (> total 0)
    (sartd:pr (strcat "Border SCALE fallback updated " (itoa total) " attribute(s) to " (sartd:current-border-scale-string) "."))
    (sartd:pr "Warning: Border SCALE fallback found no SAR_Border_Project SCALE attribute."))
  total)

(defun sartd:run-border-auto-active (/ oldauto data result fallbackCount)
  ; Robust border/title block update for SARTDALL.
  ; It tries the full SAR_Border_Project update. If anything errors, it writes
  ; the SCALE attribute as a fallback and returns normally so the workflow ends cleanly.
  (vl-load-com)
  (sartd:pr (strcat "Starting Sarens border/title block update. Final viewport scale = " (sartd:current-border-scale-string) "."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (vl-catch-all-apply 'sartd:read-data '()))
  (setq sartd:*auto-excel-source* oldauto)
  (cond
    ((vl-catch-all-error-p data)
      (sartd:pr (strcat "Warning: could not re-read Active Excel for border update: " (vl-catch-all-error-message data)))
      (sartd:update-border-scale-only))
    ((not data)
      (sartd:pr "Warning: no Excel data returned for border update. Updating SCALE only.")
      (sartd:update-border-scale-only))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (progn
          (sartd:pr (strcat "Warning: full Sarens border update failed: " (vl-catch-all-error-message result)))
          (setq fallbackCount (sartd:update-border-scale-only))
          (sartd:pr "SARTDALL continued after border fallback."))
        (progn
          ; Defensive second pass: make sure SCALE exactly matches the fitted viewport scale.
          (sartd:update-border-scale-only)
          (sartd:pr (strcat "Sarens border/title block updated. Border SCALE = " (sartd:current-border-scale-string) "."))))))
  T)

(defun sartd:post-autofit-diagnostics (/ den)
  (setq den (sartd:final-scale-denom))
  (sartd:pr (strcat "SARTDALL viewport scale stored as 1:" (sartd:scale-denom->string den) "."))
  T)

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho oldregen ok layoutName)
  ; Clean final intended order:
  ;  1 Active Excel -> 2 draw model -> 3 import sheet -> 4 activate layout
  ;  5 auto-space -> 6 viewport fit by _.MSPACE/_.ZOOM _All -> 7 snap/apply scale
  ;  8 scale dims/text/COGs/ground -> 9 update border SCALE/title -> 10 finish.
  (vl-load-com)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL corrected final order with robust border fallback."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (setq oldregen (getvar "REGENAUTO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (setq ok T)

  (setq ok (sartd:safe-stage "1/6 ModelSpace draw from Active Excel at 0,0" 'sartd:run-model-auto-active))

  (if ok
    (setq ok (sartd:safe-stage "2/6 Official PaperSpace sheet import" 'sartd:run-paper-auto-active)))

  (if ok
    (progn
      (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
      (if (and layoutName (/= layoutName ""))
        (sartd:activate-paper-layout layoutName))
      (setq ok (sartd:safe-stage "3/6 Auto-space views and viewport _.MSPACE / _.ZOOM _All fit" 'sartd:run-autofit))))

  (if ok
    (setq ok (sartd:safe-stage "4/6 Final viewport scale diagnostics" 'sartd:post-autofit-diagnostics)))

  ; No repeat SARTDA here. SARTDP/import already updates the trailer annotation tables.
  (if ok
    (progn
      (if (and layoutName (/= layoutName ""))
        (sartd:activate-paper-layout layoutName))
      (setq ok (sartd:safe-stage "5/6 Sarens border/title block update" 'sartd:run-border-auto-active))))

  ; One last paperspace return/regen attempt, but do not fail the workflow if AutoCAD refuses.
  (if ok
    (progn
      (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace '())
      (vl-catch-all-apply 'sartd:go-paperspace '())
      (sartd:pr "6/6 SARTDALL final PaperSpace restore complete.")))

  (if oldregen (sartd:setvar-safe "REGENAUTO" oldregen) (sartd:setvar-safe "REGENAUTO" 1))
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. Check the last numbered stage above."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; ============================================================================
; v0.9.9.4.3.32 FINAL OVERRIDE
; - Corrects the END VIEW 200mm alignment without moving the SIDE VIEW or PLAN VIEW.
; - The complete END VIEW group is moved only in X so its left-most generated
;   geometry/dim/block is 200mm from the right-most SIDE VIEW generated geometry.
; - After that move, the workflow runs the required viewport sequence:
;     _.MSPACE -> _.ZOOM -> _All
;   then reads the raw fitted scale, snaps upward to the internal scale list,
;   sets the viewport CustomScale, scales dims/text/COGs/ground, updates border scale,
;   and locks the viewport.
; - The PaperSpace viewport rectangle geometry is preserved: Width, Height and
;   PaperSpace Centre are saved/restored and are never intentionally resized.
; ============================================================================
(setq sartd:*version* "0.9.9.4.3.32")
(setq sartd:*end-view-gap-mm* 200.0)

(defun sartd:vp-paper-geometry (vp / cx cy w h)
  ; Save the physical PaperSpace viewport rectangle geometry.
  (if vp
    (progn
      (setq cx (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CenterX)) 0.0))
      (setq cy (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CenterY)) 0.0))
      (setq w  (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq h  (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (list cx cy w h))
    nil))

(defun sartd:restore-vp-paper-geometry (vp g)
  ; Restore the physical PaperSpace viewport rectangle geometry.
  ; This does not change the model view through the viewport.
  (if (and vp g)
    (progn
      (vl-catch-all-apply 'vlax-put-property (list vp 'CenterX (nth 0 g)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'CenterY (nth 1 g)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Width   (nth 2 g)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'Height  (nth 3 g)))
      (vl-catch-all-apply 'vla-Update (list vp))))
  T)

(defun sartd:bbox-record-v32 (obj / mn mx r mnl mxl cx cy ent role)
  (setq r (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'mn 'mx)))
  (if (vl-catch-all-error-p r)
    nil
    (progn
      (setq mnl (vlax-safearray->list mn))
      (setq mxl (vlax-safearray->list mx))
      (setq cx (/ (+ (car mnl) (car mxl)) 2.0))
      (setq cy (/ (+ (cadr mnl) (cadr mxl)) 2.0))
      (setq ent (vlax-vla-object->ename obj))
      (setq role (strcase (sartd:str (sartd:xdata-role ent))))
      (list obj ent role mnl mxl cx cy))))

(defun sartd:generated-model-bbox-records-v32 (/ ss i ent obj role layout rec out)
  ; Generated model objects only. PaperSpace viewport/border/annotation objects are ignored.
  (setq out nil)
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq layout (strcase (sartd:str (cdr (assoc 410 (entget ent))))))
        (if (and (= layout "MODEL") (/= role "VIEWPORT") (/= role "ANNOTATION"))
          (progn
            (setq obj (vlax-ename->vla-object ent))
            (setq rec (sartd:bbox-record-v32 obj))
            (if rec (setq out (cons rec out)))))
        (setq i (1+ i)))))
  (reverse out))

(defun sartd:rec-obj-v32  (r) (nth 0 r))
(defun sartd:rec-role-v32 (r) (nth 2 r))
(defun sartd:rec-minx-v32 (r) (car (nth 3 r)))
(defun sartd:rec-miny-v32 (r) (cadr (nth 3 r)))
(defun sartd:rec-maxx-v32 (r) (car (nth 4 r)))
(defun sartd:rec-maxy-v32 (r) (cadr (nth 4 r)))
(defun sartd:rec-cx-v32   (r) (nth 5 r))
(defun sartd:rec-cy-v32   (r) (nth 6 r))

(defun sartd:record-text-string-v32 (r / obj val)
  (setq obj (sartd:rec-obj-v32 r))
  (setq val (vl-catch-all-apply 'vla-get-TextString (list obj)))
  (if (vl-catch-all-error-p val) "" (strcase (vl-string-trim " \t\n\r" (sartd:str val)))))

(defun sartd:find-view-label-record-v32 (records label / found txt)
  (setq found nil)
  (foreach r records
    (if (and (not found) (= (sartd:rec-role-v32 r) "VIEW_LABEL"))
      (progn
        (setq txt (sartd:record-text-string-v32 r))
        (if (= txt (strcase label)) (setq found r)))))
  found)

(defun sartd:max-rec-x-v32 (records / v)
  (setq v nil)
  (foreach r records
    (if (or (not v) (> (sartd:rec-maxx-v32 r) v)) (setq v (sartd:rec-maxx-v32 r))))
  v)

(defun sartd:min-rec-x-v32 (records / v)
  (setq v nil)
  (foreach r records
    (if (or (not v) (< (sartd:rec-minx-v32 r) v)) (setq v (sartd:rec-minx-v32 r))))
  v)

(defun sartd:non-label-records-v32 (records / out)
  (setq out nil)
  (foreach r records
    (if (/= (sartd:rec-role-v32 r) "VIEW_LABEL")
      (setq out (cons r out))))
  (reverse out))

(defun sartd:move-object-x-v32 (obj dx / r)
  (setq r (vl-catch-all-apply 'vla-Move (list obj (sartd:pt 0.0 0.0 0.0) (sartd:pt dx 0.0 0.0))))
  (not (vl-catch-all-error-p r)))

(defun sartd:save-extents-from-records-after-end-move-v32 (records endRecords dx / minx miny maxx maxy got isEnd mnx mxx)
  ; Update saved extents after the END VIEW move so the viewport fit stage sees the final layout.
  (setq got nil)
  (foreach r records
    (setq isEnd (member r endRecords))
    (setq mnx (sartd:rec-minx-v32 r))
    (setq mxx (sartd:rec-maxx-v32 r))
    (if isEnd
      (progn
        (setq mnx (+ mnx dx))
        (setq mxx (+ mxx dx))))
    (if (not got)
      (progn
        (setq minx mnx miny (sartd:rec-miny-v32 r) maxx mxx maxy (sartd:rec-maxy-v32 r) got T))
      (progn
        (setq minx (min minx mnx))
        (setq miny (min miny (sartd:rec-miny-v32 r)))
        (setq maxx (max maxx mxx))
        (setq maxy (max maxy (sartd:rec-maxy-v32 r))))))
  (if got (sartd:save-extents (list minx miny) (list maxx maxy))))

(defun sartd:align-end-view-gap-200-v32 (/ records sideLab endLab planLab splitX splitY sideRecs endRecs sideGeom endGeom sideMax endMin dx movedCount)
  ; Corrected logic:
  ;   SIDE VIEW and PLAN VIEW are never moved.
  ;   Only generated objects wholly in the END VIEW zone are moved.
  ;   Classification uses object MIN X > splitX for END, not centre X, so long side-view objects
  ;   cannot be mistaken for END VIEW objects.
  (setq records (sartd:generated-model-bbox-records-v32))
  (setq sideLab (sartd:find-view-label-record-v32 records "SIDE VIEW"))
  (setq endLab  (sartd:find-view-label-record-v32 records "END VIEW"))
  (setq planLab (sartd:find-view-label-record-v32 records "PLAN VIEW"))
  (cond
    ((not (and sideLab endLab planLab))
      (sartd:pr "END VIEW 200mm align skipped: SIDE/END/PLAN labels were not all found.")
      nil)
    (T
      ; splitY separates upper views from PLAN VIEW. splitX separates SIDE from END.
      (setq splitX (/ (+ (sartd:rec-cx-v32 sideLab) (sartd:rec-cx-v32 endLab)) 2.0))
      (setq splitY (/ (+ (sartd:rec-cy-v32 sideLab) (sartd:rec-cy-v32 planLab)) 2.0))
      (setq sideRecs nil endRecs nil)
      (foreach r records
        (if (> (sartd:rec-cy-v32 r) splitY)
          (progn
            ; Objects starting right of splitX belong to END VIEW.
            ; Everything else in the upper zone belongs to SIDE VIEW.
            (if (> (sartd:rec-minx-v32 r) splitX)
              (setq endRecs (cons r endRecs))
              (setq sideRecs (cons r sideRecs))))))
      ; Do not let labels decide the 200mm geometry gap, but move them with their group.
      (setq sideGeom (sartd:non-label-records-v32 sideRecs))
      (setq endGeom  (sartd:non-label-records-v32 endRecs))
      (setq sideMax (sartd:max-rec-x-v32 sideGeom))
      (setq endMin  (sartd:min-rec-x-v32 endGeom))
      (if (and sideMax endMin endRecs)
        (progn
          (setq dx (- (+ sideMax sartd:*end-view-gap-mm*) endMin))
          (setq movedCount 0)
          (if (> (abs dx) 0.01)
            (progn
              (foreach r endRecs
                (if (sartd:move-object-x-v32 (sartd:rec-obj-v32 r) dx)
                  (setq movedCount (1+ movedCount))))
              (sartd:save-extents-from-records-after-end-move-v32 records endRecs dx)
              (sartd:pr (strcat "END VIEW moved only in X: left-most END geometry set "
                                (rtos sartd:*end-view-gap-mm* 2 0)
                                "mm from right-most SIDE geometry. Moved "
                                (itoa movedCount) " END object(s) by " (rtos dx 2 1) "mm.")))
            (sartd:pr "END VIEW already has the required 200mm gap from SIDE VIEW."))
          T)
        (progn
          (sartd:pr "END VIEW 200mm align skipped: could not calculate SIDE/END geometry extents.")
          nil)))))

(defun sartd:apply-viewport-scale-and-centre (vp scale ctr / ph cx cy den geom)
  ; Apply clean view scale only. PaperSpace viewport rectangle geometry is preserved.
  (if (and vp scale ctr)
    (progn
      (setq geom (sartd:vp-paper-geometry vp))
      (setq den (sartd:set-last-viewport-scale-and-border-scale scale))
      (setq cx (car ctr))
      (setq cy (cadr ctr))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
      (if (> ph 0.0)
        (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
      (sartd:restore-vp-paper-geometry vp geom)
      (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
      T)
    nil))

(defun sartd:fit-viewport-by-real-zoom-all-then-snap (vp / state ok raw scale ctr den geom)
  ; User-required viewport stage:
  ;   _.MSPACE
  ;   _.ZOOM
  ;   _All
  ; Then read the raw fit scale, snap upward, apply only the viewport view scale, and lock viewport.
  (setq den nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq geom (sartd:vp-paper-geometry vp))
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if (not ok)
        (progn
          (sartd:finish-viewport-fit vp state)
          (sartd:restore-vp-paper-geometry vp geom)
          (sartd:pr "Could not enter the floating viewport for _.MSPACE / _.ZOOM _All.")
          nil)
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:viewport-raw-scale-after-zoom-all vp))
          (setq ctr (getvar "VIEWCTR"))
          (if (not (and (listp ctr) (>= (length ctr) 2)))
            (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
          (if (and raw (> raw 0.0))
            (setq scale (sartd:choose-scale raw))
            (setq scale sartd:*default-callout-scale*))
          (setq den (sartd:scale-int scale))
          (sartd:apply-viewport-scale-and-centre vp den ctr)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:restore-vp-paper-geometry vp geom)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport fitted by _.MSPACE / _.ZOOM _All: raw approx 1:"
                            (itoa (sartd:scale-int (if raw raw den)))
                            " -> selected 1:" (itoa den)
                            ". Viewport rectangle kept unchanged; CustomScale set to "
                            (rtos (/ 1.0 (float den)) 2 8) "."))
          den)))))

(defun sartd:run-autofit (/ vp target initialScale chosenScale secondScale finalScale)
  ; Correct final order:
  ;   auto-space/redraw -> scale model callouts -> move END VIEW only to 200mm from SIDE ->
  ;   _.MSPACE / _.ZOOM _All -> read raw scale -> snap/apply CustomScale ->
  ;   redraw at final scale -> move END VIEW only -> final _.MSPACE / _.ZOOM _All -> lock viewport.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))

          ; Pass 1: draw with a provisional readable scale, then correct END VIEW position.
          (sartd:auto-redraw-spaced-at-scale initialScale)
          (sartd:align-end-view-gap-200-v32)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq chosenScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
          (if (not chosenScale) (setq chosenScale sartd:*default-callout-scale*))

          ; Pass 2: redraw at the selected scale because dim spacing/text scale affects extents.
          (sartd:auto-redraw-spaced-at-scale chosenScale)
          (sartd:align-end-view-gap-200-v32)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
          (if (not secondScale) (setq secondScale chosenScale))

          ; If the second pass picked a different scale, redraw once more at that actual final scale.
          (if (/= (sartd:scale-int secondScale) (sartd:scale-int chosenScale))
            (progn
              (setq chosenScale secondScale)
              (sartd:auto-redraw-spaced-at-scale chosenScale)
              (sartd:align-end-view-gap-200-v32)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
              (if (not secondScale) (setq secondScale chosenScale))))

          (setq finalScale (sartd:scale-int secondScale))
          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          ; Final END-only alignment after final model annotation scale.
          (sartd:align-end-view-gap-200-v32)
          ; Final viewport fit after the final END-only alignment.
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq finalScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
          (if (not finalScale) (setq finalScale (sartd:final-scale-denom)))
          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: END VIEW only moved to 200mm from SIDE VIEW, viewport ZOOM All fitted, selected scale 1:"
                            (itoa (sartd:scale-int finalScale)) ", viewport locked."))))))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; =================================================================================================
; v0.9.9.4.3.33 override
; User correction:
;   - remove the END VIEW 200mm forced alignment feature from v0.9.9.4.3.31/.32.
;   - return the model redraw stage to SARTDSPACE-style spacing.
;   - keep the END VIEW slightly closer than the older SARTDSPACE layout by reducing the normal
;     horizontal spacing constant, without moving only part of the end view.
;   - keep the viewport paper rectangle protected; only the view through it is fitted/scaled.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.33")
(setq sartd:*view-gap-x* 3500.0) ; was 6500. Gives standard SARTDSPACE layout, but with the END VIEW a little closer.

(defun sartd:redraw-sartdspace-at-scale-v33 (scale / oldauto oldspace oldautospace oldScale oldEnv data base)
  ; Redraw using the same spacing route as SARTDSPACE: no v31/v32 END-only 200mm movement.
  ; This keeps SIDE/PLAN/END as generated by the normal SARTDSPACE arrangement, with only
  ; sartd:*view-gap-x* reduced slightly to bring the END VIEW closer.
  (vl-load-com)
  (setq scale (sartd:scale-int scale))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldspace (if (boundp 'sartd:*space-override*) sartd:*space-override* nil))
  (setq oldautospace (if (boundp 'sartd:*auto-spacing-active*) sartd:*auto-spacing-active* nil))
  (setq oldScale (if (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale* nil))
  (setq oldEnv (getenv "SARTD_LAST_VIEWPORT_SCALE"))
  (setq sartd:*auto-excel-source* "Active")
  (setq sartd:*last-viewport-scale* scale)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa scale))
  (setq data (sartd:read-data T))
  (if data
    (progn
      (setq base (sartd:last-base))
      (if (not base) (setq base (list 0.0 0.0 0.0)))
      (sartd:save-base base)
      (sartd:setup-layers)
      (sartd:go-modelspace)
      (sartd:delete-generated)
      (setq sartd:*auto-spacing-active* nil) ; important: use normal SARTDSPACE spacing branch
      (setq sartd:*space-override* (sartd:modelspace))
      (sartd:draw-arrangement data base)
      (sartd:scale-generated-dims scale)
      (sartd:scale-generated-callouts scale)
      (sartd:refresh-generated-extents)
      (sartd:pr (strcat "SARTDSPACE-style model views redrawn for scale 1:" (itoa scale) "; END VIEW uses reduced standard gap, no 200mm forced move."))))
  (setq sartd:*auto-excel-source* oldauto)
  (setq sartd:*space-override* oldspace)
  (setq sartd:*auto-spacing-active* oldautospace)
  data)

(defun sartd:run-autofit (/ vp target initialScale firstScale secondScale finalScale)
  ; v0.9.9.4.3.33:
  ;   1. Run SARTDSPACE-style redraw.
  ;   2. Activate/unlock viewport and run _.MSPACE -> _.ZOOM -> _All through existing fit routine.
  ;   3. Read raw scale, snap to internal standard scale, apply CustomScale, scale generated dims/callouts.
  ;   4. Redraw once more at final scale using the same SARTDSPACE-style spacing.
  ;   5. Final viewport fit/snap and lock.
  ; No END-only 200mm alignment is used.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))

          ; Pass 1: normal SARTDSPACE-style redraw, then AutoCAD viewport ZOOM All and snap.
          (sartd:redraw-sartdspace-at-scale-v33 initialScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq firstScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
          (if (not firstScale) (setq firstScale initialScale))

          ; Pass 2: redraw using the selected scale because dim/text size affects the zoom-all result.
          (sartd:redraw-sartdspace-at-scale-v33 firstScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
          (if (not secondScale) (setq secondScale firstScale))

          ; Pass 3 only if the second pass changed the chosen denominator.
          (if (/= (sartd:scale-int secondScale) (sartd:scale-int firstScale))
            (progn
              (sartd:redraw-sartdspace-at-scale-v33 secondScale)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (setq finalScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))
              (if (not finalScale) (setq finalScale secondScale)))
            (setq finalScale secondScale))

          ; Final callout scale pass, equivalent to running the current SARTDVS scale logic after the fit.
          (sartd:scale-generated-dims finalScale)
          (sartd:scale-generated-callouts finalScale)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: normal SARTDSPACE spacing restored, END VIEW slightly closer, viewport ZOOM All fitted, selected scale 1:"
                            (itoa (sartd:scale-int finalScale)) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  ; v0.9.9.4.3.33 clean order.
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL: Active Excel -> draw model -> import sheet -> SARTDSPACE-style redraw -> _.MSPACE/_.ZOOM _All -> snap/apply scale -> update border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq ok (sartd:safe-stage "1/5 ModelSpace draw" 'sartd:run-model-auto-0))
  (if ok (setq ok (sartd:safe-stage "2/5 PaperSpace sheet import" 'sartd:run-paper-auto-active)))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "3/5 SARTDSPACE-style auto-fit" 'sartd:run-autofit))))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "4/5 Sarens border/title block update" 'sartd:run-border-auto-active))))
  (sartd:deactivate-viewport-to-paperspace)
  (sartd:setvar-safe "CMDECHO" oldcmdecho)
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "5/5 Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)

; =================================================================================================
; v0.9.9.4.3.34 override
; User correction:
;   - Keep the normal SARTDSPACE style layout, but make END VIEW a bit closer to SIDE VIEW.
;   - Do NOT resize/move the PaperSpace viewport rectangle.
;   - After the SARTDSPACE redraw, enter the real viewport and run the exact AutoCAD fit sequence:
;       _.MSPACE -> _.ZOOM -> _All
;   - Read the fitted raw viewport scale, snap UP to the next internal 1:xxx scale, add that scale
;     to the drawing scale list where possible, apply it to the viewport CustomScale, then run the
;     same model annotation scaling logic used by SARTDVS/SARTDVP, lock the viewport, update border.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.34")
(setq sartd:*view-gap-x* 2200.0) ; closer than v33, but not the broken forced 200mm END-only move.

(defun sartd:max-real (vals / out v)
  (setq out nil)
  (foreach v vals
    (if (and v (numberp v) (> v 0.0))
      (if (or (not out) (> v out)) (setq out v))))
  out)

(defun sartd:v34-viewport-paper-geometry (vp / c)
  ; Save the PaperSpace viewport object geometry so the rectangle is never resized/repositioned.
  (if vp
    (list
      (vl-catch-all-apply 'vlax-get-property (list vp 'Center))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Width))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Height)))
    nil))

(defun sartd:v34-restore-viewport-paper-geometry (vp geo)
  (if (and vp geo)
    (progn
      (if (not (vl-catch-all-error-p (car geo)))
        (vl-catch-all-apply 'vlax-put-property (list vp 'Center (car geo))))
      (if (not (vl-catch-all-error-p (cadr geo)))
        (vl-catch-all-apply 'vlax-put-property (list vp 'Width (cadr geo))))
      (if (not (vl-catch-all-error-p (caddr geo)))
        (vl-catch-all-apply 'vlax-put-property (list vp 'Height (caddr geo))))
      (vl-catch-all-apply 'vla-Update (list vp))))
  T)

(defun sartd:v34-extents-fit-denom (vp / ext ll ur pw ph mw mh sx sy)
  ; Fallback / sanity check denominator based on stored generated extents and viewport paper size.
  (setq ext (sartd:last-extents))
  (if (and vp ext)
    (progn
      (setq ll (car ext))
      (setq ur (cadr ext))
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq mw (- (car ur) (car ll)))
      (setq mh (- (cadr ur) (cadr ll)))
      (setq sx (if (> pw 0.0) (/ mw pw) nil))
      (setq sy (if (> ph 0.0) (/ mh ph) nil))
      (sartd:max-real (list sx sy)))
    nil))

(defun sartd:v34-read-raw-denom-after-zoom-all (vp / ph vh vs cs raw1 raw2 raw3 raw4 raw)
  ; Called after _.MSPACE / _.ZOOM _All. Use several readings and keep the sensible largest one.
  ; This avoids the bad 1:2 result when AutoCAD reports a misleading temporary CustomScale.
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
  (setq vs (sartd:num (getvar "VIEWSIZE") 0.0))
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (setq raw1 (if (> cs 0.0) (/ 1.0 cs) nil))
  (setq raw2 (if (and (> ph 0.0) (> vh 0.0)) (/ vh ph) nil))
  (setq raw3 (if (and (> ph 0.0) (> vs 0.0)) (/ vs ph) nil))
  (setq raw4 (sartd:v34-extents-fit-denom vp))
  ; Use the maximum sensible denominator so the final scale never crops and never collapses to 1:2.
  (setq raw (sartd:max-real (list raw1 raw2 raw3 raw4)))
  (if (or (not raw) (< raw 10.0))
    (setq raw (sartd:max-real (list raw2 raw3 raw4 raw1))))
  raw)

(defun sartd:v34-add-selected-scale-to-list (den / name ok)
  ; Add only the selected final scale. If AutoCAD refuses, carry on because CustomScale is applied directly.
  (setq den (sartd:scale-int den))
  (setq name (strcat "1:" (sartd:scale-denom->string den)))
  (cond
    ((sartd:scale-exists-p name)
      (sartd:pr (strcat "Selected viewport scale " name " already exists in the drawing scale list."))
      T)
    (T
      (setq ok (or
                 (sartd:add-scale-via-activex name den)
                 (sartd:add-scale-to-scalelist name den)
                 (sartd:add-scale-via-command name den)))
      (if ok
        (sartd:pr (strcat "Added selected viewport scale " name " to the drawing scale list."))
        (sartd:pr (strcat "Warning: could not add selected viewport scale " name " to the scale list; CustomScale still applied.")))
      ok)))

(defun sartd:v34-apply-customscale-keep-view (vp den / ctr ph)
  ; Apply viewport view scale only. Restore paper rectangle separately afterwards.
  (setq den (sartd:scale-int den))
  (setq ctr (getvar "VIEWCTR"))
  (if (not (and (listp ctr) (>= (length ctr) 2)))
    (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (if (and ctr (>= (length ctr) 2))
    (progn
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt (car ctr) (cadr ctr))))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt (car ctr) (cadr ctr) 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt (car ctr) (cadr ctr))))))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
  den)

(defun sartd:v34-fit-viewport-zoom-all-snap-apply (vp / state geo raw den ok)
  ; The exact required stage:
  ;   unlock viewport -> _.MSPACE -> _.ZOOM _All -> read raw scale -> snap up -> add/apply scale
  ;   -> SARTDVS-style model annotation scale -> lock viewport.
  (setq den nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq geo (sartd:v34-viewport-paper-geometry vp))
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if ok
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:v34-read-raw-denom-after-zoom-all vp))
          (setq den (sartd:choose-scale (if raw raw sartd:*default-callout-scale*)))
          (sartd:v34-add-selected-scale-to-list den)
          (sartd:v34-apply-customscale-keep-view vp den)
          (sartd:v34-restore-viewport-paper-geometry vp geo)
          (sartd:deactivate-viewport-to-paperspace)
          ; SARTDVS/SARTDVP equivalent: scale generated dims and model callout blocks to the viewport scale.
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport fit used _.MSPACE / _.ZOOM _All. Raw fit approx 1:"
                            (itoa (sartd:scale-int (if raw raw den)))
                            " -> selected/applied 1:" (itoa den)
                            ". SARTDVS-style annotation scaling applied and viewport locked.")))
        (progn
          (setq raw (sartd:v34-extents-fit-denom vp))
          (setq den (sartd:choose-scale (if raw raw sartd:*default-callout-scale*)))
          (sartd:v34-add-selected-scale-to-list den)
          (sartd:v34-apply-customscale-keep-view vp den)
          (sartd:v34-restore-viewport-paper-geometry vp geo)
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Warning: AutoCAD did not enter viewport. Used generated extents fallback. Selected/applied 1:"
                            (itoa den) "."))))))
  (sartd:scale-int (if den den sartd:*default-callout-scale*)))

(defun sartd:run-autofit (/ vp target initialScale firstScale finalScale)
  ; v34: SARTDSPACE-style redraw, closer end-view gap, then real viewport MSPACE/ZOOM All fit.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          ; First redraw using SARTDSPACE route with the closer END VIEW gap.
          (sartd:redraw-sartdspace-at-scale-v33 initialScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq firstScale (sartd:v34-fit-viewport-zoom-all-snap-apply vp))
          ; Redraw once at the chosen scale, then fit one final time because text/dim size affects extents.
          (sartd:redraw-sartdspace-at-scale-v33 firstScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq finalScale (sartd:v34-fit-viewport-zoom-all-snap-apply vp))
          (sartd:pr (strcat "Auto-fit complete. END VIEW uses closer SARTDSPACE gap. Final viewport/view scale = 1:"
                            (itoa (sartd:scale-int finalScale)) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL: Active Excel -> draw model -> import sheet -> SARTDSPACE closer gap -> _.MSPACE/_.ZOOM _All -> snap/apply selected 1:xxx scale -> SARTDVS scale -> lock -> border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq ok (sartd:safe-stage "1/5 ModelSpace draw" 'sartd:run-model-auto-0))
  (if ok (setq ok (sartd:safe-stage "2/5 PaperSpace sheet import" 'sartd:run-paper-auto-active)))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "3/5 SARTDSPACE closer gap + viewport zoom/all scale" 'sartd:run-autofit))))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "4/5 Sarens border/title block update" 'sartd:run-border-auto-active))))
  (sartd:deactivate-viewport-to-paperspace)
  (sartd:setvar-safe "CMDECHO" oldcmdecho)
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "5/5 Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]
 ; alias for the viewport-scale stage wording used during testing

(princ)

; =================================================================================================
; v0.9.9.4.3.35 OVERRIDE
; Requested fixes after v34 test:
;   - SARTDSPACE keeps the normal view arrangement but moves END VIEW a little closer by reducing
;     the standard horizontal view gap only. No forced END-only 200mm move.
;   - After _.MSPACE / _.ZOOM _All, read the raw fitted scale correctly. Example CustomScale
;     0.008561 -> raw 1:116.81 -> selected 1:120.
;   - Add only the selected 1:xxx scale to the AutoCAD drawing/layout scale list where possible.
;   - Apply the selected scale to the viewport CustomScale.
;   - Run SARTDVP/SARTDVS style scaling on generated dimensions/text/COG/ground blocks.
;   - COG and Ground_Hatch blocks keep XYZ scale at 1 and are scaled through their custom Scale
;     dynamic property. The selected scale is added to the drawing scale list before this property
;     is set. If the dynamic block refuses an exact scale because its internal lookup table does not
;     contain it, the nearest allowed lookup value is used and a warning is printed.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.35")
(setq sartd:*view-gap-x* 1000.0) ; SARTDSPACE END VIEW closer, but still normal generated layout.

; Longer internal scale list with 1:120 included for raw fits like 1:116.81.
(setq sartd:*standard-scale-denominators*
  '(1 2 3 4 5 6 8 10 12 15 16 18 20 22 25 30 33 35 40 45 50 55 60 65 70 75 80 85 90 95
    100 110 115 120 125 130 140 150 160 175 180 190 200 210 225 240 250 260 275 300 320 333
    350 375 400 425 450 475 500 550 600 650 700 750 800 850 900 950 1000 1100 1200 1250
    1300 1400 1500 1600 1750 1800 1900 2000 2250 2500 2750 3000 3500 4000 4500 5000
    6000 7500 10000))

(defun sartd:choose-scale (ratio / scales out s target maxScale)
  ; ratio is the raw fitted denominator after viewport ZOOM All.
  ; Pick the next internal standard denominator greater than or equal to the raw requirement.
  ; Example: 116.81 -> 120.
  (setq scales sartd:*standard-scale-denominators*)
  (setq target (max 1.0 (sartd:num ratio sartd:*default-callout-scale*)))
  (setq maxScale (if scales (car (last scales)) 10000))
  (setq out maxScale)
  (foreach s scales
    (if (and (= out maxScale) (>= (float s) target))
      (setq out s)))
  (sartd:scale-int out))

(defun sartd:v35-denom-from-scale-string (s / txt pos n)
  ; Parse common dynamic block scale strings like "1/120", "1:120", "1 / 120".
  (setq txt (vl-string-trim " \t\r\n\"" (sartd:str s)))
  (setq txt (vl-string-translate " /:" "///" txt))
  (setq pos (vl-string-search "/" txt))
  (if pos
    (progn
      (setq n (atof (substr txt (+ pos 2))))
      (if (> n 0.0) n nil))
    nil))

(defun sartd:v35-scale-candidates (den / d s)
  (setq d (sartd:scale-int den))
  (setq s (sartd:scale-denom->string d))
  (list (strcat "1/" s) (strcat "1:" s) (strcat "1 / " s) (strcat "1 : " s)))

(defun sartd:v35-allowed-string-member-p (val allowed / v hit)
  (setq hit nil)
  (foreach v allowed
    (if (= (strcase (sartd:str v)) (strcase (sartd:str val)))
      (setq hit T)))
  hit)

(defun sartd:v35-closest-allowed-scale (den allowed / d best bestDen v vd)
  ; If a dynamic block lookup table refuses the exact selected scale, use the nearest safer
  ; allowed denominator above it. If none above it exists, use the largest allowed denominator.
  (setq d (float (sartd:scale-int den)))
  (setq best nil)
  (setq bestDen nil)
  (foreach v allowed
    (setq vd (sartd:v35-denom-from-scale-string v))
    (if vd
      (cond
        ((and (>= vd d) (or (not bestDen) (< vd bestDen)))
          (setq best v)
          (setq bestDen vd)))))
  (if best
    best
    (progn
      (setq best nil)
      (setq bestDen nil)
      (foreach v allowed
        (setq vd (sartd:v35-denom-from-scale-string v))
        (if (and vd (or (not bestDen) (> vd bestDen)))
          (progn (setq best v) (setq bestDen vd))))
      best)))

(defun sartd:v35-set-scale-dynprop-smart (br den / props p pname allowed cand done fallback oldtry putres exactStr)
  ; Set a dynamic block custom "Scale" property. Adds the selected scale to the drawing scale list
  ; first. If the block property has fixed AllowedValues and does not include the selected scale,
  ; try the nearest allowed value rather than failing silently.
  (setq done nil)
  (setq den (sartd:scale-int den))
  (sartd:ensure-final-scale-in-layout-list den)
  (setq exactStr (strcat "1/" (sartd:scale-denom->string den)))
  (setq props (sartd:dynprops-list br))
  (if props
    (foreach p props
      (if (not done)
        (progn
          (setq pname (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
          (if (and (not (vl-catch-all-error-p pname))
                   (member (sartd:norm pname) (mapcar 'sartd:norm '("Scale" "Drawing Scale" "Drawing_Scale"))))
            (progn
              (setq allowed (sartd:dyn-allowed p))
              (foreach cand (sartd:v35-scale-candidates den)
                (if (and (not done) (or (not allowed) (sartd:v35-allowed-string-member-p cand allowed)))
                  (progn
                    (setq oldtry (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
                    (if (not (vl-catch-all-error-p oldtry))
                      (progn
                        (setq putres (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value oldtry cand))))
                        (if (not (vl-catch-all-error-p putres)) (setq done T)))))))
              (if (and (not done) allowed)
                (progn
                  (setq fallback (sartd:v35-closest-allowed-scale den allowed))
                  (if fallback
                    (progn
                      (setq oldtry (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
                      (if (not (vl-catch-all-error-p oldtry))
                        (progn
                          (setq putres (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value oldtry fallback))))
                          (if (not (vl-catch-all-error-p putres))
                            (progn
                              (setq done T)
                              (sartd:pr (strcat "Warning: dynamic block Scale dropdown did not accept " exactStr "; used nearest available " (sartd:str fallback) " for block " (sartd:block-effective-name br) "."))))))))))))))))
  done)

(defun sartd:scale-generated-callouts (scale / ss i ent obj role hText hView den)
  ; v35: COG and Ground_Hatch are scaled through their custom Scale property, not XYZ.
  ; The selected scale is added to the drawing/layout scale list before applying to those blocks.
  (setq den (sartd:scale-int scale))
  (sartd:ensure-final-scale-in-layout-list den)
  (setq hText (* 2.0 (float den)))
  (setq hView (* 2.0 (float den)))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq obj (vlax-ename->vla-object ent))
        (cond
          ((= role "COG")
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (sartd:v35-set-scale-dynprop-smart obj den)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "GROUND_BLOCK")
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (sartd:v35-set-scale-dynprop-smart obj den)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "COORDINATE")
            (sartd:putprop-safe obj 'XScaleFactor (float den))
            (sartd:putprop-safe obj 'YScaleFactor (float den))
            (sartd:putprop-safe obj 'ZScaleFactor (float den))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "PINNED_AXLE")
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "VIEW_LABEL")
            (sartd:putprop-safe obj 'Height hView)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "TEXT")
            (sartd:putprop-safe obj 'Height hText)
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "SARTDVP/SARTDVS scaling applied: dims/text/COGs/ground set to viewport scale 1:" (itoa den) ".")))

(defun sartd:v35-viewport-paper-geometry (vp)
  (if vp
    (list
      (vl-catch-all-apply 'vlax-get-property (list vp 'Center))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Width))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Height)))
    nil))

(defun sartd:v35-restore-viewport-paper-geometry (vp geo)
  (if (and vp geo)
    (progn
      (if (not (vl-catch-all-error-p (car geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Center (car geo))))
      (if (not (vl-catch-all-error-p (cadr geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Width (cadr geo))))
      (if (not (vl-catch-all-error-p (caddr geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Height (caddr geo))))
      (vl-catch-all-apply 'vla-Update (list vp))))
  T)

(defun sartd:v35-extents-fit-denom (vp / ext ll ur pw ph mw mh sx sy)
  (setq ext (sartd:last-extents))
  (if (and vp ext)
    (progn
      (setq ll (car ext))
      (setq ur (cadr ext))
      (setq pw (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Width)) 0.0))
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq mw (- (car ur) (car ll)))
      (setq mh (- (cadr ur) (cadr ll)))
      (setq sx (if (> pw 0.0) (/ mw pw) nil))
      (setq sy (if (> ph 0.0) (/ mh ph) nil))
      (sartd:max-real (list sx sy)))
    nil))

(defun sartd:v35-raw-denom-after-zoomall (vp / ph vh vs cs raw1 raw2 raw3 raw4 raw)
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
  (setq vs (sartd:num (getvar "VIEWSIZE") 0.0))
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (setq raw1 (if (> cs 0.0) (/ 1.0 cs) nil))
  (setq raw2 (if (and (> ph 0.0) (> vh 0.0)) (/ vh ph) nil))
  (setq raw3 (if (and (> ph 0.0) (> vs 0.0)) (/ vs ph) nil))
  (setq raw4 (sartd:v35-extents-fit-denom vp))
  ; Use the largest sensible value to avoid the old false 1:2 result.
  (setq raw (sartd:max-real (list raw1 raw2 raw3 raw4)))
  (if (or (not raw) (< raw 10.0))
    (setq raw (sartd:max-real (list raw2 raw3 raw4 raw1))))
  raw)

(defun sartd:v35-apply-vp-scale-preserve-centre (vp den / ctr ph cx cy)
  (setq den (sartd:scale-int den))
  (setq ctr (getvar "VIEWCTR"))
  (if (not (and (listp ctr) (>= (length ctr) 2)))
    (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
  (setq cx (if (and ctr (car ctr)) (car ctr) 0.0))
  (setq cy (if (and ctr (cadr ctr)) (cadr ctr) 0.0))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (sartd:set-last-viewport-scale-and-border-scale den)
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (sartd:tag (vlax-vla-object->ename vp) "VIEWPORT")
  den)

(defun sartd:v35-fit-zoomall-snap-scale (vp / state geo ok raw den)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq geo (sartd:v35-viewport-paper-geometry vp))
      (setq state (sartd:unlock-viewport-for-fit vp))
      (sartd:deactivate-viewport-to-paperspace)
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if ok
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:v35-raw-denom-after-zoomall vp))
          (if (not raw) (setq raw sartd:*default-callout-scale*))
          (setq den (sartd:choose-scale raw))
          (sartd:v35-apply-vp-scale-preserve-centre vp den)
          (sartd:v35-restore-viewport-paper-geometry vp geo)
          (sartd:deactivate-viewport-to-paperspace)
          ; SARTDVP/SARTDVS-style scale stage.
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:finish-viewport-fit vp state)
          (sartd:pr (strcat "Viewport ZOOM All raw fitted scale = 1:" (rtos raw 2 2)
                            "; rounded up and applied = 1:" (sartd:scale-denom->string den)
                            ". CustomScale=" (rtos (/ 1.0 (float den)) 2 8)
                            ". SARTDVP/SARTDVS scaling then applied.")))
        (progn
          (setq raw (sartd:v35-extents-fit-denom vp))
          (if (not raw) (setq raw sartd:*default-callout-scale*))
          (setq den (sartd:choose-scale raw))
          (sartd:v35-apply-vp-scale-preserve-centre vp den)
          (sartd:v35-restore-viewport-paper-geometry vp geo)
          (sartd:scale-generated-dims den)
          (sartd:scale-generated-callouts den)
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Warning: AutoCAD did not enter the viewport for _.MSPACE. Used generated extents fallback. Selected/applied 1:" (sartd:scale-denom->string den) "."))))
      (sartd:scale-int den))))

(defun sartd:run-space ()
  ; v35: SARTDSPACE uses the normal model redraw but with the closer standard END VIEW gap.
  (setq sartd:*view-gap-x* 1000.0)
  (sartd:run-model T))

(defun sartd:run-autofit (/ vp target initialScale firstScale finalScale)
  (vl-load-com)
  (sartd:setup-layers)
  (setq sartd:*view-gap-x* 1000.0)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< initialScale 10) (setq initialScale sartd:*default-callout-scale*))
          (sartd:redraw-sartdspace-at-scale-v33 initialScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq firstScale (sartd:v35-fit-zoomall-snap-scale vp))
          (if (not firstScale) (setq firstScale initialScale))
          ; Redraw once at the final selected scale, then fit again because annotation size changes extents.
          (sartd:redraw-sartdspace-at-scale-v33 firstScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq finalScale (sartd:v35-fit-zoomall-snap-scale vp))
          (if (not finalScale) (setq finalScale firstScale))
          (sartd:pr (strcat "Auto-fit complete. SARTDSPACE closer END VIEW gap used. Final viewport scale = 1:" (sartd:scale-denom->string finalScale) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL: Active Excel -> draw -> import sheet -> SARTDSPACE closer END VIEW -> _.MSPACE/_.ZOOM _All -> round up/apply 1:xxx -> SARTDVP scale -> border."))
  (sartd:pr "Auto workflow 2 started.")
  (setq ok (sartd:safe-stage "1/5 ModelSpace draw" 'sartd:run-model-auto-0))
  (if ok (setq ok (sartd:safe-stage "2/5 PaperSpace sheet import" 'sartd:run-paper-auto-active)))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "3/5 SARTDSPACE closer gap + viewport ZOOM All/snap/SARTDVP scale" 'sartd:run-autofit))))
  (if ok
    (progn
      (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT"))
      (setq ok (sartd:safe-stage "4/5 Sarens border/title block update" 'sartd:run-border-auto-active))))
  (sartd:deactivate-viewport-to-paperspace)
  (sartd:setvar-safe "CMDECHO" oldcmdecho)
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "5/5 Auto workflow 2 complete.")
    (sartd:pr "Auto workflow 2 stopped before completion. The command stack has been restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)

; =================================================================================================
; v0.9.9.4.3.36 CLEAN OVERRIDE
; Purpose:
;   - Clean up APPLOAD output.
;   - Remove all use of vla-get-Scales / VLA-GET-SCALES.
;   - Do not run layout scale-list work during the ModelSpace draw.
;   - After viewport _.MSPACE -> _.ZOOM _All, read raw CustomScale, round up to the next internal
;     1:xxx scale, add that selected scale to the drawing scale list, apply CustomScale, then run
;     SARTDVP/SARTDVS-style scaling.
;   - COG and Ground_Hatch first try dynamic custom Scale. If not accepted/available, fall back to
;     XYZ scaling so the drawing still completes.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.36")
(setq sartd:*view-gap-x* 1000.0)

(defun sartd:v36-append-range (lst start stop step / n out)
  (setq out lst)
  (setq n start)
  (while (<= n stop)
    (if (not (member n out)) (setq out (append out (list n))))
    (setq n (+ n step)))
  out)

(defun sartd:v36-unique-sorted (lst / sorted out x)
  (setq sorted (vl-sort lst '<))
  (setq out nil)
  (foreach x sorted
    (if (not (member x out)) (setq out (append out (list x)))))
  out)

(defun sartd:v36-build-scale-list (/ lst)
  ; Massive but still rounded/nice internal list.
  ; Important: raw 1:116.81 will select 1:120, not 1:117.
  (setq lst '(1 2 3 4 5 6 8 10 12 15 16 18 20 22 25 30 33 35 40 45 50))
  (setq lst (sartd:v36-append-range lst 55 500 5))
  (setq lst (sartd:v36-append-range lst 510 1000 10))
  (setq lst (sartd:v36-append-range lst 1025 2000 25))
  (setq lst (sartd:v36-append-range lst 2050 5000 50))
  (setq lst (sartd:v36-append-range lst 5100 10000 100))
  (sartd:v36-unique-sorted lst))

(setq sartd:*standard-scale-denominators* (sartd:v36-build-scale-list))

(defun sartd:scale-int (v / n)
  (setq n (fix (+ 0.5 (abs (sartd:num v sartd:*default-callout-scale*)))))
  (if (< n 1) (setq n (fix sartd:*default-callout-scale*)))
  (if (> n 10000) (setq n 10000))
  n)

(defun sartd:choose-scale (ratio / scales out s target maxScale)
  ; Pick the next clean 1:xxx scale UP from the raw fit.
  ; Example: raw 116.81 -> 120.
  (setq scales sartd:*standard-scale-denominators*)
  (setq target (max 1.0 (sartd:num ratio sartd:*default-callout-scale*)))
  (setq maxScale (if scales (car (last scales)) 10000))
  (setq out maxScale)
  (foreach s scales
    (if (and (= out maxScale) (>= (float s) target))
      (setq out s)))
  (sartd:scale-int out))

(defun sartd:v36-scale-name (den)
  (strcat "1:" (sartd:scale-denom->string (sartd:scale-int den))))

(defun sartd:add-scale-via-activex (name denom)
  ; Disabled deliberately. This AutoCAD profile does not expose vla-get-Scales reliably.
  nil)

(defun sartd:v36-add-scale-to-layout-list (den / name ok oldcmdecho res)
  ; Add only the final selected scale. Never add a huge list at APPLOAD.
  (setq den (sartd:scale-int den))
  (setq name (sartd:v36-scale-name den))
  (cond
    ((sartd:scale-exists-p name) T)
    (T
      (setq ok (vl-catch-all-apply 'sartd:add-scale-to-scalelist (list name den)))
      (if (or (vl-catch-all-error-p ok) (not (sartd:scale-exists-p name)))
        (progn
          ; Command fallback. It is only attempted when the visible SCALE object is still missing.
          (setq oldcmdecho (getvar "CMDECHO"))
          (sartd:setvar-safe "CMDECHO" 0)
          (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-SCALELISTEDIT" "_Add" name (strcat "1:" (sartd:scale-denom->string den)) "_Exit")))
          (sartd:setvar-safe "CMDECHO" oldcmdecho)))
      (if (sartd:scale-exists-p name)
        (progn (sartd:pr (strcat "Added/confirmed viewport scale " name " in the drawing scale list.")) T)
        (progn (sartd:pr (strcat "Warning: could not add " name " to the visible scale list. CustomScale is still applied directly.")) nil)))))

(defun sartd:ensure-final-scale-in-layout-list (scale / den)
  ; Safe replacement: no ActiveX Scales collection.
  (setq den (sartd:scale-int scale))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  (sartd:v36-add-scale-to-layout-list den)
  den)

(defun sartd:set-last-viewport-scale-and-border-scale (scale / den)
  (setq den (sartd:scale-int scale))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  (sartd:v36-add-scale-to-layout-list den)
  den)

(defun sartd:v36-dynprop-put-scale (br den / props p pname old allowed cand putres done)
  ; Try the custom dynamic Scale property first.
  (setq done nil)
  (setq props (sartd:dynprops-list br))
  (if props
    (foreach p props
      (if (not done)
        (progn
          (setq pname (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
          (if (and (not (vl-catch-all-error-p pname))
                   (member (sartd:norm pname) (mapcar 'sartd:norm '("Scale" "Drawing Scale" "Drawing_Scale"))))
            (progn
              (setq old (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
              (setq allowed (sartd:dyn-allowed p))
              (foreach cand (list
                              (strcat "1/" (sartd:scale-denom->string den))
                              (strcat "1:" (sartd:scale-denom->string den))
                              (strcat "1 / " (sartd:scale-denom->string den))
                              (strcat "1 : " (sartd:scale-denom->string den))
                              (float den)
                              den)
                (if (and (not done)
                         (or (not allowed)
                             (numberp cand)
                             (sartd:v35-allowed-string-member-p cand allowed)))
                  (progn
                    (if (vl-catch-all-error-p old)
                      (setq putres (vl-catch-all-apply 'vlax-put-property (list p 'Value cand)))
                      (setq putres (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value old cand)))))
                    (if (not (vl-catch-all-error-p putres)) (setq done T)))))))))))
  done)

(defun sartd:v36-scale-cog-ground (obj den / ok nm)
  ; Required behaviour:
  ;   Preferred: XYZ stays 1 and custom Scale is set.
  ;   Fallback: if custom Scale does not exist/does not accept the value, use XYZ scale factors.
  (setq den (sartd:scale-int den))
  (setq ok (sartd:v36-dynprop-put-scale obj den))
  (if ok
    (progn
      (sartd:putprop-safe obj 'XScaleFactor 1.0)
      (sartd:putprop-safe obj 'YScaleFactor 1.0)
      (sartd:putprop-safe obj 'ZScaleFactor 1.0))
    (progn
      (setq nm (vl-catch-all-apply 'sartd:block-effective-name (list obj)))
      (if (vl-catch-all-error-p nm) (setq nm "COG/Ground block"))
      (sartd:pr (strcat "Warning: " (sartd:str nm) " did not accept custom Scale 1/" (sartd:scale-denom->string den) "; using XYZ scale fallback."))
      (sartd:putprop-safe obj 'XScaleFactor (float den))
      (sartd:putprop-safe obj 'YScaleFactor (float den))
      (sartd:putprop-safe obj 'ZScaleFactor (float den))))
  (vl-catch-all-apply 'vla-Update (list obj))
  ok)

(defun sartd:scale-generated-callouts (scale / ss i ent obj role hText hView den)
  ; No scale-list work here. This may run during ModelSpace drawing; it must never crash or prompt.
  (setq den (sartd:scale-int scale))
  (setq hText (* 2.0 (float den)))
  (setq hView (* 2.0 (float den)))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq obj (vlax-ename->vla-object ent))
        (cond
          ((= role "COG")
            (sartd:v36-scale-cog-ground obj den))
          ((= role "GROUND_BLOCK")
            (sartd:v36-scale-cog-ground obj den))
          ((= role "COORDINATE")
            (sartd:putprop-safe obj 'XScaleFactor (float den))
            (sartd:putprop-safe obj 'YScaleFactor (float den))
            (sartd:putprop-safe obj 'ZScaleFactor (float den))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "PINNED_AXLE")
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "VIEW_LABEL")
            (sartd:putprop-safe obj 'Height hView)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "TEXT")
            (sartd:putprop-safe obj 'Height hText)
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "SARTDVP/SARTDVS scaling applied to dims/text/COGs/ground for viewport scale 1:" (itoa den) ".")))

(defun sartd:v36-raw-denom-after-zoomall (vp / cs raw ph vh vs raw2 raw3 raw4)
  ; After _.MSPACE + _.ZOOM _All, the viewport CustomScale is the best raw fit.
  ; Use that first. Only fall back if it is missing/tiny.
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (setq raw (if (> cs 0.0000001) (/ 1.0 cs) nil))
  (if (and raw (> raw 10.0))
    raw
    (progn
      (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
      (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
      (setq vs (sartd:num (getvar "VIEWSIZE") 0.0))
      (setq raw2 (if (and (> ph 0.0) (> vh 0.0)) (/ vh ph) nil))
      (setq raw3 (if (and (> ph 0.0) (> vs 0.0)) (/ vs ph) nil))
      (setq raw4 (if (fboundp 'sartd:v35-extents-fit-denom) (sartd:v35-extents-fit-denom vp) nil))
      (sartd:max-real (list raw2 raw3 raw4 raw)))))

(defun sartd:v36-viewport-paper-geometry (vp)
  (if vp
    (list
      (vl-catch-all-apply 'vlax-get-property (list vp 'Center))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Width))
      (vl-catch-all-apply 'vlax-get-property (list vp 'Height)))
    nil))

(defun sartd:v36-restore-viewport-paper-geometry (vp geo)
  (if (and vp geo)
    (progn
      (if (not (vl-catch-all-error-p (car geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Center (car geo))))
      (if (not (vl-catch-all-error-p (cadr geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Width (cadr geo))))
      (if (not (vl-catch-all-error-p (caddr geo))) (vl-catch-all-apply 'vlax-put-property (list vp 'Height (caddr geo))))
      (vl-catch-all-apply 'vla-Update (list vp))))
  T)

(defun sartd:v36-apply-vp-scale (vp den / ctr ph cx cy)
  ; Change only the model view through the viewport; do not resize the PaperSpace viewport rectangle.
  (setq den (sartd:set-last-viewport-scale-and-border-scale den))
  (setq ctr (getvar "VIEWCTR"))
  (if (not (and (listp ctr) (>= (length ctr) 2)))
    (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
  (setq cx (if (and ctr (car ctr)) (car ctr) 0.0))
  (setq cy (if (and ctr (cadr ctr)) (cadr ctr) 0.0))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
  (vl-catch-all-apply 'vla-Update (list vp))
  den)

(defun sartd:v36-fit-zoomall-round-apply (vp / state geo ok raw den)
  (setq den nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq geo (sartd:v36-viewport-paper-geometry vp))
      (setq state (sartd:unlock-viewport-for-fit vp))
      (sartd:deactivate-viewport-to-paperspace)
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if ok
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:v36-raw-denom-after-zoomall vp)))
        (progn
          (sartd:pr "Warning: could not enter viewport with _.MSPACE. Using generated extents fallback for scale only.")
          (setq raw (if (fboundp 'sartd:v35-extents-fit-denom) (sartd:v35-extents-fit-denom vp) nil))))
      (if (not raw) (setq raw sartd:*default-callout-scale*))
      (setq den (sartd:choose-scale raw))
      (sartd:v36-apply-vp-scale vp den)
      (sartd:v36-restore-viewport-paper-geometry vp geo)
      (sartd:deactivate-viewport-to-paperspace)
      ; Equivalent to running SARTDVP/SARTDVS on the viewport.
      (sartd:scale-generated-dims den)
      (sartd:scale-generated-callouts den)
      (sartd:finish-viewport-fit vp state)
      (sartd:pr (strcat "Viewport fit: raw CustomScale result approx 1:" (rtos raw 2 2)
                        " -> rounded/applied 1:" (sartd:scale-denom->string den)
                        "; CustomScale=" (rtos (/ 1.0 (float den)) 2 8)
                        ". Viewport locked; SARTDVP scaling applied."))))
  (sartd:scale-int (if den den sartd:*default-callout-scale*)))

(defun sartd:run-space ()
  (setq sartd:*view-gap-x* 1000.0)
  (sartd:run-model T))

(defun sartd:run-autofit (/ vp target initialScale finalScale)
  (vl-load-com)
  (sartd:setup-layers)
  (setq sartd:*view-gap-x* 1000.0)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDAUTOFIT could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          ; SARTDSPACE-style redraw. Keep it simple: draw once, then fit/round/apply once.
          (setq initialScale sartd:*default-callout-scale*)
          (sartd:redraw-sartdspace-at-scale-v33 initialScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq finalScale (sartd:v36-fit-zoomall-round-apply vp))
          (sartd:pr (strcat "Auto-fit complete. SARTDSPACE closer END VIEW gap used. Final viewport scale = 1:" (sartd:scale-denom->string finalScale) "."))))))
  (princ))

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL clean workflow."))
  (sartd:pr "1/5 ModelSpace draw from Active Excel at 0,0.")
  (setq ok (sartd:safe-stage "1/5 ModelSpace draw" 'sartd:run-model-auto-0))
  (if ok (progn (sartd:pr "2/5 Import official PaperSpace sheet/layout.") (setq ok (sartd:safe-stage "2/5 PaperSpace sheet import" 'sartd:run-paper-auto-active))))
  (if ok (progn (sartd:pr "3/5 SARTDSPACE redraw, viewport ZOOM All, round/apply selected scale, then SARTDVP scaling.") (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT")) (setq ok (sartd:safe-stage "3/5 SARTDSPACE + viewport scale" 'sartd:run-autofit))))
  (if ok (progn (sartd:pr "4/5 Update Sarens border/title block scale and title fields.") (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT")) (setq ok (sartd:safe-stage "4/5 Sarens border/title block update" 'sartd:run-border-auto-active))))
  (sartd:deactivate-viewport-to-paperspace)
  (sartd:setvar-safe "CMDECHO" oldcmdecho)
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "5/5 SARTDALL complete.")
    (sartd:pr "SARTDALL stopped before completion. Command state restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(princ)


; =================================================================================================
; v0.9.9.4.3.37 SCALE-LIST OVERRIDE
; Purpose:
;   - Stop creating custom/extra viewport scales.
;   - Use only scales that already exist in the current drawing/layout viewport scale list.
;   - After _.MSPACE -> _.ZOOM _All, read the raw fitted scale, then choose the next SAFE
;     available 1:xxx scale from the viewport scale list and apply that to the viewport view.
;   - SARTDVP/SARTDVS uses the same available-scale logic.
;   - COG and Ground blocks use the chosen available denominator for their custom Scale property;
;     if the dynamic property rejects it, XYZ scale factors are used as fallback.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.37")
(setq sartd:*view-gap-x* 1000.0)

(defun sartd:v37-distof (s / r)
  (setq r (vl-catch-all-apply 'distof (list (sartd:str s) 2)))
  (if (vl-catch-all-error-p r) nil r))

(defun sartd:v37-scale-name-denom (name / p a b)
  ; Returns denominator from visible names like "1:120". Skips enlarged scales like "2:1".
  (setq name (sartd:str name))
  (setq p (vl-string-search ":" name))
  (if p
    (progn
      (setq a (sartd:v37-distof (substr name 1 p)))
      (setq b (sartd:v37-distof (substr name (+ p 2))))
      (if (and a b (> a 0.0) (> b 0.0) (<= a b))
        (/ b a)
        nil))
    nil))

(defun sartd:v37-scale-record-denom (rec / objtype name pu du den1 den2)
  ; Read a true SCALE/AcDbScale record from ACAD_SCALELIST.
  ; Codes 140/141 are paper/drawing units for real AcDbScale objects.
  (setq objtype (strcase (sartd:str (cdr (assoc 0 rec)))))
  (if (not (member objtype '("SCALE" "ACDBSCALE")))
    nil
    (progn
      (setq name (cdr (assoc 300 rec)))
      (setq pu (sartd:num (cdr (assoc 140 rec)) 0.0))
      (setq du (sartd:num (cdr (assoc 141 rec)) 0.0))
      (setq den1 (if (and (> pu 0.0) (> du 0.0) (>= du pu)) (/ du pu) nil))
      (setq den2 (sartd:v37-scale-name-denom name))
      ; Prefer the visible name if it is a normal 1:xxx scale.
      (cond
        ((and den2 (>= den2 1.0) (<= den2 10000.0)) den2)
        ((and den1 (>= den1 1.0) (<= den1 10000.0)) den1)
        (T nil)))))

(defun sartd:v37-unique-sort-denoms (lst / out x n)
  (setq out nil)
  (foreach x (vl-sort lst '<)
    ; Use integer denominators because the rest of SARTD scaling is denominator based.
    (setq n (sartd:scale-int x))
    (if (and (>= n 1) (<= n 10000) (not (member n out)))
      (setq out (append out (list n)))))
  out)

(defun sartd:v37-visible-scale-denominators (/ dictRec dict entry obj data den denoms)
  ; Returns only the scales AutoCAD exposes in the current drawing scale list / viewport dropdown.
  ; No scales are created here.
  (setq denoms nil)
  (setq dictRec (vl-catch-all-apply 'dictsearch (list (namedobjdict) "ACAD_SCALELIST")))
  (if (and (not (vl-catch-all-error-p dictRec)) dictRec)
    (progn
      (setq dict (cdr (assoc -1 dictRec)))
      (setq entry (dictnext dict T))
      (while entry
        (setq obj (cdr (assoc 350 entry)))
        (if obj
          (progn
            (setq data (entget obj))
            (setq den (sartd:v37-scale-record-denom data))
            (if den (setq denoms (cons den denoms)))))
        (setq entry (dictnext dict)))))
  (sartd:v37-unique-sort-denoms denoms))

(defun sartd:v37-fallback-scale-denominators ()
  ; Only used if AutoCAD's scale list cannot be read at all.
  ; The workflow still does not add scales.
  '(1 2 5 10 20 25 30 40 50 75 100 125 150 175 200 250 300 400 500 750 1000 1500 2000 5000 10000))

(defun sartd:v37-choose-from-denoms (raw denoms / target chosen s)
  ; Pick the closest available safe viewport scale, i.e. the first denominator >= raw.
  ; This avoids cropping. If raw is beyond the list, use the largest available scale.
  (setq target (max 1.0 (sartd:num raw sartd:*default-callout-scale*)))
  (setq denoms (sartd:v37-unique-sort-denoms denoms))
  (if (not denoms) (setq denoms (sartd:v37-fallback-scale-denominators)))
  (setq chosen (car (last denoms)))
  (foreach s denoms
    (if (and chosen (>= (float s) target) (= chosen (car (last denoms))))
      (setq chosen s)))
  (sartd:scale-int chosen))

(defun sartd:v37-choose-available-scale (raw / denoms chosen)
  (setq denoms (sartd:v37-visible-scale-denominators))
  (if denoms
    (progn
      (setq chosen (sartd:v37-choose-from-denoms raw denoms))
      (sartd:pr (strcat "Available viewport scales used. Raw fit 1:" (rtos (sartd:num raw 0.0) 2 2)
                        " -> selected existing scale 1:" (sartd:scale-denom->string chosen) "."))
      chosen)
    (progn
      (setq chosen (sartd:v37-choose-from-denoms raw (sartd:v37-fallback-scale-denominators)))
      (sartd:pr (strcat "Warning: could not read viewport scale list. Fallback scale used: 1:" (sartd:scale-denom->string chosen) "."))
      chosen)))

(defun sartd:choose-scale (ratio)
  ; Global replacement: all SARTD fitting now chooses from the existing drawing viewport scale list only.
  (sartd:v37-choose-available-scale ratio))

(defun sartd:v36-add-scale-to-layout-list (den)
  ; v37: disabled. Do not create custom/extra viewport scales.
  nil)

(defun sartd:add-scale-to-scalelist (name denom)
  ; v37: disabled. Do not create custom/extra viewport scales.
  nil)

(defun sartd:ensure-final-scale-in-layout-list (scale / den)
  ; v37: store final scale only; never add it to the scale list.
  (setq den (sartd:scale-int scale))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  den)

(defun sartd:set-last-viewport-scale-and-border-scale (scale / den)
  ; v37: store final scale only; never add it to the scale list.
  (setq den (sartd:scale-int scale))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  den)

(defun sartd:v37-vp-raw-denom (vp / cs)
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (if (> cs 0.0000001)
    (/ 1.0 cs)
    (sartd:viewport-scale-from-object vp)))

(defun sartd:v36-apply-vp-scale (vp den / ctr ph cx cy)
  ; Apply an existing drawing scale to the MODEL VIEW through the viewport.
  ; The PaperSpace viewport rectangle geometry is not scaled or moved.
  (setq den (sartd:set-last-viewport-scale-and-border-scale den))
  (setq ctr (getvar "VIEWCTR"))
  (if (not (and (listp ctr) (>= (length ctr) 2)))
    (setq ctr (sartd:to-list (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))))
  (setq cx (if (and ctr (car ctr)) (car ctr) 0.0))
  (setq cy (if (and ctr (cadr ctr)) (cadr ctr) 0.0))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
  (vl-catch-all-apply 'vla-Update (list vp))
  den)

(defun sartd:v36-fit-zoomall-round-apply (vp / state geo ok raw den)
  (setq den nil)
  (if (not (and vp (sartd:floating-pviewport-p vp)))
    nil
    (progn
      (setq geo (sartd:v36-viewport-paper-geometry vp))
      (setq state (sartd:unlock-viewport-for-fit vp))
      (sartd:deactivate-viewport-to-paperspace)
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if ok
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:v37-vp-raw-denom vp)))
        (progn
          (sartd:pr "Warning: could not enter viewport with _.MSPACE. Using generated extents fallback for scale only.")
          (setq raw (if (fboundp 'sartd:v35-extents-fit-denom) (sartd:v35-extents-fit-denom vp) nil))))
      (if (not raw) (setq raw sartd:*default-callout-scale*))
      (setq den (sartd:v37-choose-available-scale raw))
      (sartd:v36-apply-vp-scale vp den)
      (sartd:v36-restore-viewport-paper-geometry vp geo)
      (sartd:deactivate-viewport-to-paperspace)
      (sartd:scale-generated-dims den)
      (sartd:scale-generated-callouts den)
      (sartd:finish-viewport-fit vp state)
      (sartd:pr (strcat "Viewport fit complete. Raw fit approx 1:" (rtos raw 2 2)
                        "; selected EXISTING viewport scale 1:" (sartd:scale-denom->string den)
                        "; CustomScale set to " (rtos (/ 1.0 (float den)) 2 8)
                        ". No custom scales were created."))))
  (sartd:scale-int (if den den sartd:*default-callout-scale*)))

(defun sartd:scale-from-selected-viewport-only (/ vp raw den)
  ; SARTDVS / SARTDVP: select viewport, snap its current raw scale to the next existing viewport scale,
  ; apply that scale to the viewport, then scale generated dims/text/COGs/ground to match.
  (vl-load-com)
  (sartd:setup-layers)
  (setq vp (sartd:strict-selected-paper-viewport "\nSelect PaperSpace viewport to read/round scale from: "))
  (if vp
    (progn
      (setq raw (sartd:v37-vp-raw-denom vp))
      (setq den (sartd:v37-choose-available-scale raw))
      (sartd:v36-apply-vp-scale vp den)
      (setq sartd:*last-viewport-scale* den)
      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
      (sartd:scale-generated-dims den)
      (sartd:scale-generated-callouts den)
      (sartd:pr
        (strcat
          "SARTDVP complete. Raw viewport scale approx 1:" (rtos raw 2 2)
          " -> existing viewport scale 1:" (sartd:scale-denom->string den)
          ". Trailers, pinned axle blocks and hydraulic group blocks were not scaled."))))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho ok)
  (vl-load-com)
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL uses existing viewport scales only; no custom scales are created."))
  (sartd:pr "1/5 ModelSpace draw from Active Excel at 0,0.")
  (setq ok (sartd:safe-stage "1/5 ModelSpace draw" 'sartd:run-model-auto-0))
  (if ok (progn (sartd:pr "2/5 Import official PaperSpace sheet/layout.") (setq ok (sartd:safe-stage "2/5 PaperSpace sheet import" 'sartd:run-paper-auto-active))))
  (if ok (progn (sartd:pr "3/5 SARTDSPACE redraw, viewport ZOOM All, choose nearest safe existing viewport scale, then SARTDVP scaling.") (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT")) (setq ok (sartd:safe-stage "3/5 SARTDSPACE + viewport scale" 'sartd:run-autofit))))
  (if ok (progn (sartd:pr "4/5 Update Sarens border/title block using selected viewport scale.") (sartd:activate-paper-layout (getenv "SARTD_LAST_LAYOUT")) (setq ok (sartd:safe-stage "4/5 Sarens border/title block update" 'sartd:run-border-auto-active))))
  (sartd:deactivate-viewport-to-paperspace)
  (sartd:setvar-safe "CMDECHO" oldcmdecho)
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "5/5 SARTDALL complete.")
    (sartd:pr "SARTDALL stopped before completion. Command state restored."))
  (princ))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; v41 removed older load message:

; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.39 CLEAN COMMAND / BORDER TEMPLATE / SCALE OVERRIDE
; Purpose:
;   - SARTDALL is now the only full-auto command. The older SARTDALL route is disabled.
;   - SARTDVP is removed. SARTDVS is the viewport-scale command.
;   - SARTDVS and SARTDALL apply the nearest safe EXISTING viewport scale from the dropdown list.
;     Example: raw CustomScale 0.008894 = approx 1:112.44, so with 1:100 then 1:150 available,
;     the viewport is set to 1:150 and generated dims/blocks are scaled to 1:150.
;   - PaperSpace import now prompts for the border sheet in the block library:
;       Sarens = layout 1-1
;       T.EN   = layout 2-2
;   - Border/title update is less Sarens-name dependent so the T.EN title block can be updated too.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.39")
(setq sartd:*paper-template-layout* nil)
(setq sartd:*paper-template-label* nil)

(defun sartd:v38-any-member-str (items wanted / found x y)
  (setq found nil)
  (foreach x items
    (foreach y wanted
      (if (= (strcase (sartd:str x)) (strcase (sartd:str y)))
        (setq found T))))
  found)

(defun sartd:v38-block-attribute-tags (obj / tags atts a tag)
  (setq tags nil)
  (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
    (progn
      (setq atts (vl-catch-all-apply 'vlax-invoke (list obj 'GetAttributes)))
      (if (not (vl-catch-all-error-p atts))
        (foreach a (sartd:to-list atts)
          (setq tag (vl-catch-all-apply 'vla-get-TagString (list a)))
          (if (not (vl-catch-all-error-p tag))
            (setq tags (cons (strcase (sartd:str tag)) tags)))))))
  tags)

(defun sartd:v38-border-block-p (obj / nm tags)
  ; Works for the original SAR_Border_Project and for likely T.EN/TEN/title/border block names.
  ; If the block name is unknown, the title-block attribute tags are used as the identifier.
  (setq nm (strcase (sartd:block-effective-name obj)))
  (setq tags (sartd:v38-block-attribute-tags obj))
  (or
    (= nm "SAR_BORDER_PROJECT")
    (wcmatch nm "*BORDER*,*TITLE*,*T.EN*,*TEN*,*T_E_N*,*T-EN*")
    (sartd:v38-any-member-str tags '("CLIENT" "DOCUMENTNUMBER" "PROJECT" "DRAWN" "VERIFIED" "APPROVED" "APPRSTATE" "DRAWINGTYPE" "TITLE_1" "TITLE_2" "TITLE_3" "CLIENT_DOC_REF" "SC_DOC_REF" "SHT" "FOLIO"))))

(defun sartd:v38-select-paper-template (/ ans)
  ; Returns the layout name held in the library drawing.
  ; Sarens border = 1-1, T.EN border = 2-2.
  ; Uses getstring rather than getkword so the user can type T.EN, TEN, 2 or 2-2.
  (sartd:pr "PaperSpace border templates in block library: Sarens = 1-1, T.EN = 2-2.")
  (setq ans (getstring T "\nSelect PaperSpace border/template [Sarens/T.EN] <Sarens>: "))
  (setq ans (strcase (vl-string-trim " \t\n\r" (sartd:str ans))))
  (cond
    ((member ans '("T" "TEN" "T.EN" "T-EN" "T_EN" "2" "2-2"))
      (setq sartd:*paper-template-layout* "2-2")
      (setq sartd:*paper-template-label* "T.EN"))
    (T
      (setq sartd:*paper-template-layout* "1-1")
      (setq sartd:*paper-template-label* "Sarens")))
  (setenv "SARTD_LAST_PAPER_TEMPLATE_LAYOUT" sartd:*paper-template-layout*)
  (setenv "SARTD_LAST_PAPER_TEMPLATE_LABEL" sartd:*paper-template-label*)
  (sartd:pr (strcat "Selected " sartd:*paper-template-label* " PaperSpace border/template, library layout " sartd:*paper-template-layout* "."))
  sartd:*paper-template-layout*)

(defun sartd:import-library-layout (/ path layout before after added target oldcmdecho res)
  ; v38: import the user-selected layout from the unified block library DWG.
  ; Library convention:
  ;   1-1 = Sarens border
  ;   2-2 = T.EN border
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn
      (sartd:pr "No unified block library DWG found for layout import.")
      nil)
    (progn
      (setq layout (sartd:v38-select-paper-template))
      (setq before (sartd:layout-names-current))
      (if (and layout (sartd:layout-name-exists-p layout before))
        (progn
          ; Avoid AutoCAD's duplicate-layout prompt. Use the existing imported tab if present.
          (setq target layout)
          (setenv "SARTD_LAST_LAYOUT" target)
          (sartd:activate-paper-layout target)
          (sartd:pr (strcat sartd:*paper-template-label* " PaperSpace layout already exists; using existing layout: " target))
          target)
        (progn
          (setq oldcmdecho (getvar "CMDECHO"))
          (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
          (sartd:pr (strcat "Importing " sartd:*paper-template-label* " official layout '" layout "' from unified block library."))
          (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path layout)))
          (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
          (if (vl-catch-all-error-p res)
            (progn
              (sartd:pr (strcat "Layout import command failed for library layout " layout ": " (vl-catch-all-error-message res)))
              (sartd:pr "Check the block library contains layout 1-1 for Sarens and 2-2 for T.EN.")
              nil)
            (progn
              (setq after (sartd:layout-names-current))
              (setq added (sartd:layout-name-diff after before))
              (cond
                (added (setq target (car added)))
                ((and layout (sartd:layout-name-exists-p layout after)) (setq target layout))
                (T (setq target nil)))
              (if (not target)
                (progn
                  (sartd:pr "Layout import ran, but no new PaperSpace layout tab was detected.")
                  (sartd:pr "Check that the block library DWG has saved PaperSpace layout tabs named 1-1 and 2-2.")
                  nil)
                (progn
                  (setenv "SARTD_LAST_LAYOUT" target)
                  (sartd:activate-paper-layout target)
                  (sartd:pr (strcat sartd:*paper-template-label* " PaperSpace sheet imported as layout: " target))
                  target)))))))))

(defun sartd:v36-apply-vp-scale (vp den / vc lst cx cy ph)
  ; v38 replacement: apply an existing 1:den viewport scale without relying on VIEWCTR.
  ; This preserves the viewport's current model view centre, so SARTDVS will not jump the view.
  (setq den (sartd:set-last-viewport-scale-and-border-scale den))
  (setq vc (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))
  (setq lst (if (vl-catch-all-error-p vc) nil (sartd:to-list vc)))
  (setq cx (if (and lst (car lst)) (car lst) 0.0))
  (setq cy (if (and lst (cadr lst)) (cadr lst) 0.0))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
  (vl-catch-all-apply 'vla-Update (list vp))
  den)

(defun sartd:scale-from-selected-viewport-only (/ vp raw den)
  ; SARTDVS: select a PaperSpace viewport, snap its current raw scale to the next safe existing
  ; viewport scale in the AutoCAD dropdown list, apply it to the viewport, then scale generated
  ; dimensions/text/COGs/ground blocks to match. No custom scales are created.
  (vl-load-com)
  (sartd:setup-layers)
  (setq vp (sartd:strict-selected-paper-viewport "\nSelect PaperSpace viewport to read/round scale from: "))
  (if vp
    (progn
      (setq raw (sartd:v37-vp-raw-denom vp))
      (setq den (sartd:v37-choose-available-scale raw))
      (sartd:v36-apply-vp-scale vp den)
      (setq sartd:*last-viewport-scale* den)
      (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
      (sartd:scale-generated-dims den)
      (sartd:scale-generated-callouts den)
      (sartd:pr
        (strcat
          "SARTDVS complete. Raw viewport scale approx 1:" (rtos raw 2 2)
          " -> existing viewport scale 1:" (sartd:scale-denom->string den)
          ". Generated dims/text/COG/ground blocks scaled to match. Trailer blocks were not scaled."))))
  (princ))

(defun sartd:update-border-attributes (data / amap ps obj total candidates)
  ; v38: update Sarens or T.EN title/border blocks using attributes, not only the old SAR_Border_Project name.
  (sartd:go-paperspace)
  (setq amap (sartd:attr-map data))
  (setq ps (sartd:paperspace))
  (setq total 0)
  (setq candidates 0)
  (vlax-for obj ps
    (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
      (if (sartd:v38-border-block-p obj)
        (progn
          (setq candidates (1+ candidates))
          (setq total (+ total (sartd:set-block-attributes obj amap)))))))
  (cond
    ((> total 0)
      (sartd:pr (strcat "Updated border/title block attributes: " (itoa total) " value(s).")))
    ((> candidates 0)
      (sartd:pr "Border/title block found, but no matching attribute tags were updated."))
    (T
      (sartd:pr "No Sarens/T.EN border/title block candidate found on the current PaperSpace layout.")))
  total)

(defun sartd:update-border-scale-only (/ ps obj total amap tags)
  ; v38: scale fallback for either Sarens or T.EN borders.
  ; First updates recognised border/title blocks. If none are recognised, it falls back to any
  ; PaperSpace block containing a SCALE attribute.
  (setq total 0)
  (setq amap (sartd:border-scale-map))
  (vl-catch-all-apply 'sartd:go-paperspace '())
  (setq ps (vl-catch-all-apply 'sartd:paperspace '()))
  (if (not (vl-catch-all-error-p ps))
    (progn
      (vlax-for obj ps
        (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
          (if (sartd:v38-border-block-p obj)
            (setq total (+ total (sartd:set-block-attributes obj amap))))))
      (if (= total 0)
        (vlax-for obj ps
          (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
            (progn
              (setq tags (sartd:v38-block-attribute-tags obj))
              (if (sartd:v38-any-member-str tags '("SCALE"))
                (setq total (+ total (sartd:set-block-attributes obj amap))))))))))
  (if (> total 0)
    (sartd:pr (strcat "Border/title SCALE updated " (itoa total) " attribute(s) to " (sartd:current-border-scale-string) "."))
    (sartd:pr "Warning: border/title SCALE fallback found no SCALE attribute."))
  total)

(defun sartd:run-auto-workflow2 (/ oldauto oldcmdecho oldregen ok layoutName)
  ; v38 clean main workflow behind SARTDALL.
  ; 1 draw model from Active Excel at 0,0
  ; 2 prompt Sarens/T.EN, import selected PaperSpace sheet
  ; 3 activate imported layout
  ; 4 auto-space + viewport ZOOM All + choose existing viewport dropdown scale
  ; 5 scale generated dims/blocks and update border/title data
  ; 6 return safely to PaperSpace
  (vl-load-com)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDALL clean main workflow."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq oldcmdecho (getvar "CMDECHO"))
  (setq oldregen (getvar "REGENAUTO"))
  (sartd:setvar-safe "CMDECHO" 0)
  (sartd:setvar-safe "REGENAUTO" 0)
  (setq sartd:*auto-excel-source* "Active")
  (setq ok T)

  (sartd:pr "1/6 Draw model from Active Excel at 0,0.")
  (setq ok (sartd:safe-stage "1/6 ModelSpace draw" 'sartd:run-model-auto-active))

  (if ok
    (progn
      (sartd:pr "2/6 Import selected PaperSpace sheet from block library.")
      (setq ok (sartd:safe-stage "2/6 PaperSpace sheet import" 'sartd:run-paper-auto-active))))

  (if ok
    (progn
      (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
      (if (and layoutName (/= layoutName ""))
        (sartd:activate-paper-layout layoutName))
      (sartd:pr "3/6 Auto-space views, run viewport ZOOM All, then apply nearest safe existing viewport scale.")
      (setq ok (sartd:safe-stage "3/6 Auto-space and viewport scale" 'sartd:run-autofit))))

  (if ok
    (progn
      (sartd:pr "4/6 Confirm final viewport scale for dims/blocks/border.")
      (setq ok (sartd:safe-stage "4/6 Final viewport scale diagnostics" 'sartd:post-autofit-diagnostics))))

  (if ok
    (progn
      (if (and layoutName (/= layoutName ""))
        (sartd:activate-paper-layout layoutName))
      (sartd:pr "5/6 Update selected border/title block attributes.")
      (setq ok (sartd:safe-stage "5/6 Border/title block update" 'sartd:run-border-auto-active))))

  (if ok
    (progn
      (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace '())
      (vl-catch-all-apply 'sartd:go-paperspace '())
      (vl-catch-all-apply 'vla-Regen (list (vla-get-ActiveDocument (vlax-get-acad-object)) 1))
      (sartd:pr "6/6 PaperSpace restored and drawing regenerated.")))

  (if oldregen (sartd:setvar-safe "REGENAUTO" oldregen) (sartd:setvar-safe "REGENAUTO" 1))
  (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
  (setq sartd:*auto-excel-source* oldauto)
  (if ok
    (sartd:pr "SARTDALL complete.")
    (sartd:pr "SARTDALL stopped before completion. Check the last numbered stage above."))
  (princ))


(defun sartd:run-border-auto-active (/ oldauto data result fallbackCount)
  ; v38: robust border/title block update for SARTDALL.
  ; Re-reads Active Excel with refresh flag T, then updates Sarens or T.EN title blocks.
  ; If Excel or the full title update fails, SCALE is still written so the workflow completes.
  (vl-load-com)
  (sartd:pr (strcat "Starting border/title block update. Final viewport scale = " (sartd:current-border-scale-string) "."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (setq sartd:*auto-excel-source* oldauto)
  (cond
    ((vl-catch-all-error-p data)
      (sartd:pr (strcat "Warning: could not re-read Active Excel for border update: " (vl-catch-all-error-message data)))
      (sartd:update-border-scale-only))
    ((not data)
      (sartd:pr "Warning: no Excel data returned for border update. Updating SCALE only.")
      (sartd:update-border-scale-only))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (progn
          (sartd:pr (strcat "Warning: full border/title update failed: " (vl-catch-all-error-message result)))
          (setq fallbackCount (sartd:update-border-scale-only))
          (sartd:pr "SARTDALL continued after border/title fallback."))
        (progn
          ; Defensive second pass: make sure SCALE exactly matches the fitted viewport scale.
          (sartd:update-border-scale-only)
          (sartd:pr (strcat "Border/title block updated. Border SCALE = " (sartd:current-border-scale-string) "."))))))
  T)

; Clean exposed command set.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; Disable retired/test workflow commands from the command line.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; v41 removed older load message:

; [v59 cleanup removed old public command/load form]

(princ)



; =================================================================================================
; v0.9.9.4.3.40 SELECTED BORDER IMPORT + T.EN REVISION SIGNOFF OVERRIDE
; Purpose:
;   - SARTDP / SARTDALL imports the selected library layout explicitly:
;       Sarens = 1-1
;       T.EN   = 2-2
;     If exact import fails, it imports all paper layouts and then activates the selected one.
;   - T.EN title block revision/signoff tags are filled from the workbook revision rows:
;       REV#/DATE#/STATUS#/WRITT#/CHKBY#/APPBY#
;     Plus aliases for Drawn By / Checked By / Approved By style tags.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.41")

(defun sartd:v40-layout-match-p (nm chosen / a b)
  (setq a (strcase (sartd:str nm)))
  (setq b (strcase (sartd:str chosen)))
  (or (= a b) (wcmatch a (strcat b "*"))))

(defun sartd:v40-pick-layout (after added chosen / target n)
  ; Prefer the exact selected layout, then duplicate/imported names beginning with it, then any newly added layout.
  (setq target nil)
  (foreach n after
    (if (and (not target) (= (strcase (sartd:str n)) (strcase (sartd:str chosen))))
      (setq target n)))
  (if (not target)
    (foreach n added
      (if (and (not target) (sartd:v40-layout-match-p n chosen))
        (setq target n))))
  (if (not target)
    (foreach n after
      (if (and (not target) (sartd:v40-layout-match-p n chosen))
        (setq target n))))
  (if (not target)
    (if added (setq target (car added))))
  target)

(defun sartd:v40-import-layout-command (path layout / res)
  ; Import one named layout from the library/template drawing.
  (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path layout)))
  res)

(defun sartd:import-library-layout (/ path layout before after added target oldcmdecho res res2 beforeHas)
  ; v40: prompt once, then import the exact selected library layout.
  ; Library convention:
  ;   1-1 = Sarens border
  ;   2-2 = T.EN border
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn
      (sartd:pr "No unified block library DWG found for layout import.")
      nil)
    (progn
      (setq layout (sartd:v38-select-paper-template))
      (setq before (sartd:layout-names-current))
      (setq beforeHas (sartd:layout-name-exists-p layout before))
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (cond
        (beforeHas
          ; Avoid duplicate-name command prompts. This usually only happens when the user reruns the tool.
          (sartd:pr (strcat "Selected " sartd:*paper-template-label* " layout '" layout "' already exists in this drawing; using that existing tab."))
          (setq res nil))
        (T
          (sartd:pr (strcat "Importing selected " sartd:*paper-template-label* " PaperSpace layout '" layout "' from block library: " path))
          (setq res (sartd:v40-import-layout-command path layout))))
      (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))

      (setq after (sartd:layout-names-current))
      (setq added (sartd:layout-name-diff after before))
      (setq target (sartd:v40-pick-layout after added layout))

      ; Fallback: some AutoCAD/template sessions do not accept the named layout but will import with *.
      ; If that happens, import all layouts and still choose the selected one, not just the first added tab.
      (if (and (not target) (not beforeHas))
        (progn
          (setq oldcmdecho (getvar "CMDECHO"))
          (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
          (sartd:pr (strcat "Exact layout import did not expose '" layout "'. Importing all library layouts as fallback, then selecting " sartd:*paper-template-label* "."))
          (setq res2 (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path "*")))
          (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
          (setq after (sartd:layout-names-current))
          (setq added (sartd:layout-name-diff after before))
          (setq target (sartd:v40-pick-layout after added layout))))

      (cond
        (target
          (setenv "SARTD_LAST_LAYOUT" target)
          (sartd:activate-paper-layout target)
          (sartd:pr (strcat "Using selected " sartd:*paper-template-label* " PaperSpace sheet layout: " target))
          target)
        ((vl-catch-all-error-p res)
          (sartd:pr (strcat "Layout import command failed for selected layout " layout ": " (vl-catch-all-error-message res)))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)
        (T
          (sartd:pr (strcat "Layout import ran, but the selected layout '" layout "' was not found afterwards."))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)))))

(defun sartd:v40-latest-rev-row (sh / r found)
  (setq found nil)
  (setq r 12)
  (while (and (not found) (>= r 8))
    (if (sartd:v39-rev-row-active-p sh r)
      (setq found r))
    (setq r (1- r)))
  found)

(defun sartd:v40-row-rev (sh row)
  (sartd:v39-first-cell-or-dash sh '("B" "A") row))
(defun sartd:v40-row-date (sh row)
  (sartd:v39-cell-or-dash sh (strcat "C" (itoa row))))
(defun sartd:v40-row-written (sh row)
  (sartd:v39-cell-or-dash sh (strcat "L" (itoa row))))
(defun sartd:v40-row-check (sh row)
  (sartd:v39-cell-or-dash sh (strcat "M" (itoa row))))
(defun sartd:v40-row-approve (sh row)
  (sartd:v39-cell-or-dash sh (strcat "N" (itoa row))))
(defun sartd:v40-row-status (sh row)
  (sartd:v39-ten-status sh row))

(defun sartd:v40-add-rev-row-map (out sh idx row / rev dt wr chk app st)
  ; idx = T.EN title block row number 1 to 4. row = workbook row 9 to 12.
  (setq rev (sartd:v40-row-rev sh row))
  (setq dt  (sartd:v40-row-date sh row))
  (setq wr  (sartd:v40-row-written sh row))
  (setq chk (sartd:v40-row-check sh row))
  (setq app (sartd:v40-row-approve sh row))
  (setq st  (sartd:v40-row-status sh row))
  (append out
    (list
      (cons (strcat "REV" (itoa idx)) rev)
      (cons (strcat "DATE" (itoa idx)) dt)
      (cons (strcat "STATUS" (itoa idx)) st)
      (cons (strcat "WRITT" (itoa idx)) wr)
      (cons (strcat "WRIT" (itoa idx)) wr)
      (cons (strcat "WRITTEN" (itoa idx)) wr)
      (cons (strcat "WRITTENBY" (itoa idx)) wr)
      (cons (strcat "DRAWN" (itoa idx)) wr)
      (cons (strcat "DRAWNBY" (itoa idx)) wr)
      (cons (strcat "CHKBY" (itoa idx)) chk)
      (cons (strcat "CHECKBY" (itoa idx)) chk)
      (cons (strcat "CHECKEDBY" (itoa idx)) chk)
      (cons (strcat "CHECKER" (itoa idx)) chk)
      (cons (strcat "VERIFIED" (itoa idx)) chk)
      (cons (strcat "VERIFIEDBY" (itoa idx)) chk)
      (cons (strcat "APPBY" (itoa idx)) app)
      (cons (strcat "APPRBY" (itoa idx)) app)
      (cons (strcat "APPROVED" (itoa idx)) app)
      (cons (strcat "APPROVEDBY" (itoa idx)) app)
      (cons (strcat "APPROVER" (itoa idx)) app))))

(defun sartd:v40-revision-signoff-map (data / sh out latest rev dt wr chk app st)
  (setq sh (sartd:g 'sheet-main data))
  (setq out nil)
  (if sh
    (progn
      ; Top/general fields use the latest populated workbook revision row, scanning 12 down to 8.
      (setq latest (sartd:v40-latest-rev-row sh))
      (if latest
        (progn
          (setq rev (sartd:v40-row-rev sh latest))
          (setq dt  (sartd:v40-row-date sh latest))
          (setq wr  (sartd:v40-row-written sh latest))
          (setq chk (sartd:v40-row-check sh latest))
          (setq app (sartd:v40-row-approve sh latest))
          (setq st  (sartd:v40-row-status sh latest))
          (setq out
            (append out
              (list
                (cons "REV" rev)
                (cons "REVISION" rev)
                (cons "DATE" dt)
                (cons "STATUS" st)
                (cons "DRAWN" wr)
                (cons "DRAWNBY" wr)
                (cons "WRITTEN" wr)
                (cons "WRITTENBY" wr)
                (cons "WRITT" wr)
                (cons "CHECK" chk)
                (cons "CHECKBY" chk)
                (cons "CHECKED" chk)
                (cons "CHECKEDBY" chk)
                (cons "CHECKER" chk)
                (cons "VERIFIED" chk)
                (cons "VERIFIEDBY" chk)
                (cons "APPROVED" app)
                (cons "APPROVEDBY" app)
                (cons "APPROVER" app)
                (cons "APPBY" app)
                (cons "APPRSTATE" st))))))
      ; T.EN visible revision rows. Bottom row 1 = workbook row 9; top row 4 = workbook row 12.
      (setq out (sartd:v40-add-rev-row-map out sh 1 9))
      (setq out (sartd:v40-add-rev-row-map out sh 2 10))
      (setq out (sartd:v40-add-rev-row-map out sh 3 11))
      (setq out (sartd:v40-add-rev-row-map out sh 4 12))))
  out)

(defun sartd:v40-border-map (data)
  ; Put v40 revision/signoff values first, so they win over older generic values.
  (append (sartd:v40-revision-signoff-map data) (sartd:attr-map data)))

(defun sartd:update-all-paperspace-annotations (data / amap ps obj total)
  ; v40: all PaperSpace attributes, including T.EN rev/signoff fields.
  (sartd:go-paperspace)
  (setq amap (sartd:v40-border-map data))
  (setq ps (sartd:paperspace))
  (setq total 0)
  (vlax-for obj ps
    (if (= (strcase (sartd:str (vla-get-ObjectName obj))) "ACDBBLOCKREFERENCE")
      (setq total (+ total (sartd:set-block-attributes obj amap)))))
  (sartd:pr (strcat "Updated " (itoa total) " PaperSpace annotation/border attribute(s), including revision/signoff tags where present."))
  total)

(defun sartd:update-border-attributes (data / amap ps obj total candidates)
  ; v40: update Sarens or T.EN title/border blocks, including revision rows and signoffs.
  (sartd:go-paperspace)
  (setq amap (sartd:v40-border-map data))
  (setq ps (sartd:paperspace))
  (setq total 0)
  (setq candidates 0)
  (vlax-for obj ps
    (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
      (if (sartd:v38-border-block-p obj)
        (progn
          (setq candidates (1+ candidates))
          (setq total (+ total (sartd:set-block-attributes obj amap)))))))
  (cond
    ((> total 0)
      (sartd:pr (strcat "Updated border/title block attributes: " (itoa total) " value(s), including rev/drawn/check/approved where the tags exist.")))
    ((> candidates 0)
      (sartd:pr "Border/title block found, but no matching attribute tags were updated."))
    (T
      (sartd:pr "No Sarens/T.EN border/title block candidate found on the current PaperSpace layout.")))
  total)

; Keep the clean exposed command set and disabled old commands after the override reloads.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; v41 removed older load message:

; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.41 BRUTALLY CLEAN PUBLIC COMMAND INTERFACE
; Purpose:
;   - SARTDALL is now the main full workflow command.
;   - SARTDALL2 and all old/test/long command names are removed from the command line.
;   - Only the seven short production commands are exposed.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.41")

; Clear old/test/long public command names so the command list stays clean.
; Internal sartd:* functions are left in place because the final workflow depends on them.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; Final production commands.

; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.42 VIEWPORT SCALE + LAYOUT RENAME FIXES
; Purpose:
;   - Fix SARTDVS crash: bad argument type: consp 10000.
;   - Make the scale jump choose the next proper scale UP, not a random/custom denominator.
;   - Run the generated dims/block scaling AFTER the viewport has jumped to the final scale.
;   - In SARTDALL, use the same viewport scale core as SARTDVS after ZOOM All.
;   - When importing Sarens or T.EN from the block library, rename the final drawing layout as 1-#.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.42")

(defun sartd:v42-member-int (x lst / hit n)
  (setq hit nil)
  (setq n (sartd:scale-int x))
  (foreach a lst
    (if (= n (sartd:scale-int a)) (setq hit T)))
  hit)

(defun sartd:v42-unique-sort (lst / out n)
  (setq out nil)
  (foreach n (vl-sort (mapcar 'sartd:scale-int lst) '<)
    (if (and (>= n 1) (<= n 10000) (not (member n out)))
      (setq out (append out (list n)))))
  out)

(defun sartd:v42-proper-scale-denominators ()
  ; Clean engineering drawing scales. Used as the fallback and as a filter against random/custom scales.
  '(1 2 5 10 20 25 50 75 100 125 150 175 200 250 300 400 500 750 1000 1250 1500 2000 2500 5000 10000))

(defun sartd:v42-visible-proper-scale-denominators (/ visible proper out s)
  ; Prefer the scales already present in the current drawing dropdown, but ignore odd/custom scales.
  (setq visible (vl-catch-all-apply 'sartd:v37-visible-scale-denominators nil))
  (if (vl-catch-all-error-p visible) (setq visible nil))
  (setq visible (sartd:v42-unique-sort visible))
  (setq proper (sartd:v42-proper-scale-denominators))
  (setq out nil)
  (foreach s proper
    (if (sartd:v42-member-int s visible)
      (setq out (append out (list (sartd:scale-int s))))))
  (if out out proper))

(defun sartd:v42-next-scale-up (raw / target scales chosen s)
  ; Correct next-up logic.
  ; Example: raw 112.44 -> 150. raw 150.00 -> 150. raw 150.01 -> 175/200 depending available list.
  (setq target (max 1.0 (sartd:num raw sartd:*default-callout-scale*)))
  (setq scales (sartd:v42-visible-proper-scale-denominators))
  (setq scales (sartd:v42-unique-sort scales))
  (setq chosen nil)
  (foreach s scales
    (if (and (not chosen) (>= (float s) target))
      (setq chosen s)))
  (if (not chosen) (setq chosen (car (last scales))))
  (sartd:scale-int chosen))

(defun sartd:choose-scale (ratio)
  ; Global final chooser used by SARTDALL and SARTDVS.
  (sartd:v42-next-scale-up ratio))

(defun sartd:v42-safe-view-centre (vp / vc lst ctr)
  ; Always return a two-number list. Prevents bad argument type: consp <number> failures.
  (setq ctr nil)
  (setq vc (vl-catch-all-apply 'vlax-get-property (list vp 'ViewCenter)))
  (if (not (vl-catch-all-error-p vc))
    (setq lst (sartd:to-list vc)))
  (if (and (listp lst) (numberp (car lst)) (numberp (cadr lst)))
    (setq ctr (list (float (car lst)) (float (cadr lst)))))
  (if (not ctr)
    (progn
      (setq vc (vl-catch-all-apply 'getvar (list "VIEWCTR")))
      (if (not (vl-catch-all-error-p vc))
        (progn
          (setq lst (if (listp vc) vc nil))
          (if (and (listp lst) (numberp (car lst)) (numberp (cadr lst)))
            (setq ctr (list (float (car lst)) (float (cadr lst)))))))))
  (if ctr ctr (list 0.0 0.0)))

(defun sartd:v42-read-vp-raw-denom (vp / cs ph vh vs raw)
  ; Reads the current viewport model/paper scale denominator safely.
  ; After ZOOM All, VIEWSIZE / paper viewport height is usually the true raw fit scale.
  (setq raw nil)
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (setq vs (sartd:num (vl-catch-all-apply 'getvar (list "VIEWSIZE")) 0.0))
  (setq vh (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'ViewHeight)) 0.0))
  (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
  (cond
    ((and (> ph 0.0) (> vs 0.0) (/= (getvar "CVPORT") 1)) (setq raw (/ vs ph)))
    ((and (> ph 0.0) (> vh 0.0)) (setq raw (/ vh ph)))
    ((> cs 0.0000001) (setq raw (/ 1.0 cs)))
    (T (setq raw sartd:*default-callout-scale*)))
  (sartd:num raw sartd:*default-callout-scale*))

(defun sartd:v42-apply-viewport-scale (vp den / state ctr ph cx cy)
  ; Applies the final chosen denominator to the viewport only.
  ; Does not scale generated dims/blocks here; that is deliberately done afterwards.
  (setq den (sartd:scale-int den))
  (setq state (sartd:unlock-viewport-for-fit vp))
  (setq ctr (sartd:v42-safe-view-centre vp))
  (setq cx (car ctr))
  (setq cy (cadr ctr))
  (setq ph (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'Height)) 0.0))
  (vl-catch-all-apply 'vla-put-CustomScale (list vp (/ 1.0 (float den))))
  (if (> ph 0.0)
    (vl-catch-all-apply 'vlax-put-property (list vp 'ViewHeight (* ph (float den)))))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewTarget (sartd:pt cx cy 0.0)))
  (vl-catch-all-apply 'vlax-put-property (list vp 'ViewCenter (sartd:2dpt cx cy)))
  (vl-catch-all-apply 'vla-Update (list vp))
  (sartd:finish-viewport-fit vp state)
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  den)

(defun sartd:v42-scale-generated-after-vp-jump (den)
  ; This is the SARTDVS core stage. It is intentionally after the viewport scale jump.
  (setq den (sartd:scale-int den))
  (sartd:scale-generated-dims den)
  (sartd:scale-generated-callouts den)
  (if (fboundp 'sartd:update-border-scale-only)
    (vl-catch-all-apply 'sartd:update-border-scale-only nil))
  den)

(defun sartd:v42-viewport-jump-then-scale-generated (vp raw / den)
  ; Shared by SARTDVS and SARTDALL.
  (setq raw (sartd:num raw sartd:*default-callout-scale*))
  (setq den (sartd:v42-next-scale-up raw))
  (sartd:v42-apply-viewport-scale vp den)
  (sartd:v42-scale-generated-after-vp-jump den)
  (sartd:pr (strcat "Viewport scale jump fixed. Raw approx 1:" (rtos raw 2 2)
                    " -> proper scale 1:" (sartd:scale-denom->string den)
                    ". SARTDVS scaling then ran on dims/text/COG/ground."))
  den)

(defun sartd:v37-vp-raw-denom (vp)
  ; Override old reader to avoid VIEWCTR/list problems.
  (sartd:v42-read-vp-raw-denom vp))

(defun sartd:v36-apply-vp-scale (vp den)
  ; Override old applier to avoid bad consp errors.
  (sartd:v42-apply-viewport-scale vp den))

(defun sartd:scale-from-selected-viewport-only (/ vp raw den)
  ; SARTDVS: select PaperSpace viewport, choose next proper scale up, apply it, THEN scale generated items.
  (vl-load-com)
  (sartd:setup-layers)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (setq vp (sartd:strict-selected-paper-viewport "\nSelect PaperSpace viewport to read/round scale from: "))
  (if vp
    (progn
      (setq raw (sartd:v42-read-vp-raw-denom vp))
      (setq den (sartd:v42-viewport-jump-then-scale-generated vp raw))
      (sartd:pr (strcat "SARTDVS complete. Final viewport scale = 1:" (sartd:scale-denom->string den) "."))))
  (princ))

(defun sartd:fit-viewport-by-real-zoom-all-then-snap (vp / state ok raw den)
  ; SARTDALL viewport stage:
  ;   enter the viewport -> ZOOM All -> read raw fit -> jump to next proper scale -> run SARTDVS core.
  (setq den nil)
  (if (and vp (sartd:floating-pviewport-p vp))
    (progn
      (setq state (sartd:unlock-viewport-for-fit vp))
      (setq ok (sartd:enter-viewport-modelspace vp))
      (if ok
        (progn
          (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_All"))
          (setq raw (sartd:v42-read-vp-raw-denom vp))
          (setq den (sartd:v42-viewport-jump-then-scale-generated vp raw))
          (sartd:deactivate-viewport-to-paperspace))
        (progn
          (sartd:finish-viewport-fit vp state)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr "Warning: could not enter viewport for ZOOM All. Using viewport current scale/extents fallback.")
          (setq raw (sartd:v42-read-vp-raw-denom vp))
          (setq den (sartd:v42-viewport-jump-then-scale-generated vp raw))))
      (sartd:finish-viewport-fit vp state)))
  (sartd:scale-int (if den den sartd:*default-callout-scale*)))

(defun sartd:run-autofit (/ vp target initialScale chosenScale secondScale)
  ; v42: SARTDALL auto-fit uses the fixed scale jump and then runs the SARTDVS core after the jump.
  (vl-load-com)
  (sartd:setup-layers)
  (setq target (getenv "SARTD_LAST_LAYOUT"))
  (sartd:activate-paper-layout target)
  (cond
    ((= (getvar "TILEMODE") 1)
      (sartd:pr "SARTDALL could not activate a PaperSpace layout. Run SARTDP first or click a layout tab."))
    (T
      (sartd:deactivate-viewport-to-paperspace)
      (setq vp (sartd:auto-viewport-from-current-layout))
      (if (not vp)
        (sartd:pr "No real floating PaperSpace viewport found on the current sheet. Run SARTDP first.")
        (progn
          (setq initialScale (sartd:viewport-scale-from-object vp))
          (if (< (sartd:scale-int initialScale) 10) (setq initialScale sartd:*default-callout-scale*))
          (sartd:auto-redraw-spaced-at-scale initialScale)

          ; First fit/jump.
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq chosenScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))

          ; Redraw at the chosen scale, then final fit/jump because annotation size affects extents.
          (sartd:auto-redraw-spaced-at-scale chosenScale)
          (sartd:activate-paper-layout target)
          (sartd:deactivate-viewport-to-paperspace)
          (setq vp (sartd:auto-viewport-from-current-layout))
          (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))

          ; If final fitting needs a larger scale, redraw once more and fit once more.
          (if (/= (sartd:scale-int secondScale) (sartd:scale-int chosenScale))
            (progn
              (setq chosenScale secondScale)
              (sartd:auto-redraw-spaced-at-scale chosenScale)
              (sartd:activate-paper-layout target)
              (sartd:deactivate-viewport-to-paperspace)
              (setq vp (sartd:auto-viewport-from-current-layout))
              (setq secondScale (sartd:fit-viewport-by-real-zoom-all-then-snap vp))))

          (setq chosenScale (sartd:scale-int secondScale))
          (sartd:v42-scale-generated-after-vp-jump chosenScale)
          (sartd:deactivate-viewport-to-paperspace)
          (sartd:pr (strcat "Auto-fit complete: ZOOM All raw scale jumped to proper scale 1:"
                            (sartd:scale-denom->string chosenScale)
                            "; SARTDVS scaling ran afterwards."))))))
  (princ))

(defun sartd:v42-output-layout-exists-p (name / names)
  (setq names (sartd:layout-names-current))
  (sartd:layout-name-exists-p name names))

(defun sartd:v42-next-output-layout-name (/ i nm)
  ; Final drawing layouts are always 1-# regardless of whether the source library sheet was 1-1 or 2-2.
  (setq i 1)
  (setq nm (strcat "1-" (itoa i)))
  (while (sartd:v42-output-layout-exists-p nm)
    (setq i (1+ i))
    (setq nm (strcat "1-" (itoa i))))
  nm)

(defun sartd:v42-layout-object (name / doc lays lay res)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq lays (vla-get-Layouts doc))
  (setq res (vl-catch-all-apply 'vla-Item (list lays name)))
  (if (vl-catch-all-error-p res) nil res))

(defun sartd:v42-rename-imported-layout-as-sheet1 (target / lay new res)
  ; Rename imported border layout to 1-#.
  ; If it is already 1-# it is kept as-is.
  (if (and target (wcmatch (strcase (sartd:str target)) "1-*"))
    target
    (progn
      (setq lay (sartd:v42-layout-object target))
      (if lay
        (progn
          (setq new (sartd:v42-next-output-layout-name))
          (setq res (vl-catch-all-apply 'vla-put-Name (list lay new)))
          (if (vl-catch-all-error-p res)
            (progn
              (sartd:pr (strcat "Warning: could not rename imported layout '" target "' to '" new "'. Using original name."))
              target)
            (progn
              (sartd:pr (strcat "Imported " sartd:*paper-template-label* " layout renamed from '" target "' to '" new "'."))
              new)))
        target))))

(defun sartd:import-library-layout (/ path layout before after added target oldcmdecho res res2 beforeHas)
  ; v42: import selected library layout exactly, then rename final drawing tab as 1-#.
  ; Source library layouts remain:
  ;   Sarens = 1-1
  ;   T.EN   = 2-2
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn
      (sartd:pr "No unified block library DWG found for layout import.")
      nil)
    (progn
      (setq layout (sartd:v38-select-paper-template))
      (setq before (sartd:layout-names-current))
      (setq beforeHas (sartd:layout-name-exists-p layout before))
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (cond
        (beforeHas
          (sartd:pr (strcat "Selected source layout '" layout "' already exists in this drawing; using it then applying 1-# naming."))
          (setq res nil))
        (T
          (sartd:pr (strcat "Importing selected " sartd:*paper-template-label* " source layout '" layout "' from block library: " path))
          (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path layout)))))
      (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))

      (setq after (sartd:layout-names-current))
      (setq added (sartd:layout-name-diff after before))
      (setq target (sartd:v40-pick-layout after added layout))

      (if (and (not target) (not beforeHas))
        (progn
          (setq oldcmdecho (getvar "CMDECHO"))
          (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
          (sartd:pr (strcat "Exact layout import did not expose '" layout "'. Importing all layouts as fallback, then selecting " sartd:*paper-template-label* "."))
          (setq res2 (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path "*")))
          (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
          (setq after (sartd:layout-names-current))
          (setq added (sartd:layout-name-diff after before))
          (setq target (sartd:v40-pick-layout after added layout))))

      (cond
        (target
          (setq target (sartd:v42-rename-imported-layout-as-sheet1 target))
          (setenv "SARTD_LAST_LAYOUT" target)
          (sartd:activate-paper-layout target)
          (sartd:pr (strcat "Using selected " sartd:*paper-template-label* " PaperSpace sheet as drawing layout: " target))
          target)
        ((vl-catch-all-error-p res)
          (sartd:pr (strcat "Layout import command failed for selected source layout " layout ": " (vl-catch-all-error-message res)))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)
        (T
          (sartd:pr (strcat "Layout import ran, but the selected source layout '" layout "' was not found afterwards."))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)))))

; Re-apply clean production command names after overrides.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)

; =================================================================================================
; v0.9.9.4.3.43 COG/GROUND CUSTOM SCALE + BORDER SCALE FORCE FIX
; Purpose:
;   - COG and Ground blocks now use their dynamic Custom > Scale dropdown where possible.
;   - If the exact viewport scale is not available in that block dropdown, choose the closest
;     allowed dropdown value instead of blindly forcing XYZ scale.
;   - The border/title SCALE attribute is forced from the final viewport denominator only.
;     This prevents stale template values such as 1:2 remaining on the T.EN/Sarens border
;     when the actual viewport has been set to 1:200.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.43")

(defun sartd:v43-unvariant (v / r)
  (if (= (type v) 'VARIANT)
    (progn
      (setq r (vl-catch-all-apply 'vlax-variant-value (list v)))
      (if (vl-catch-all-error-p r) v r))
    v))

(defun sartd:v43-distof-safe (s / r)
  (setq r (vl-catch-all-apply 'distof (list (vl-string-trim " \t\n\r" (sartd:str s)) 2)))
  (if (vl-catch-all-error-p r) nil r))

(defun sartd:v43-scale-denom-from-value (v / x s p a b pct)
  ; Converts common scale/dropdown values to a denominator.
  ; Examples: "1:200" -> 200, "1/200" -> 200, "0.5%" -> 200, 0.005 -> 200, 200 -> 200.
  (setq x (sartd:v43-unvariant v))
  (cond
    ((numberp x)
      (cond
        ((and (> (abs x) 0.0) (< (abs x) 1.0)) (/ 1.0 (abs x)))
        ((and (>= (abs x) 1.0) (<= (abs x) 10000.0)) (abs x))
        (T nil)))
    (T
      (setq s (vl-string-trim " \t\n\r" (sartd:str x)))
      (cond
        ((= s "") nil)
        ((setq p (vl-string-search "%" s))
          (setq pct (sartd:v43-distof-safe (substr s 1 p)))
          (if (and pct (> pct 0.0)) (/ 100.0 pct) nil))
        ((setq p (vl-string-search ":" s))
          (setq a (sartd:v43-distof-safe (substr s 1 p)))
          (setq b (sartd:v43-distof-safe (substr s (+ p 2))))
          (if (and a b (> a 0.0) (> b 0.0)) (/ b a) nil))
        ((setq p (vl-string-search "/" s))
          (setq a (sartd:v43-distof-safe (substr s 1 p)))
          (setq b (sartd:v43-distof-safe (substr s (+ p 2))))
          (if (and a b (> a 0.0) (> b 0.0)) (/ b a) nil))
        (T
          (setq a (sartd:v43-distof-safe s))
          (if (and a (> a 0.0) (<= a 10000.0)) a nil))))))

(defun sartd:v43-scale-prop-p (p / pname)
  (setq pname (vl-catch-all-apply 'vlax-get-property (list p 'PropertyName)))
  (and
    (not (vl-catch-all-error-p pname))
    (member (sartd:norm pname) (mapcar 'sartd:norm '("Scale" "Drawing Scale" "Drawing_Scale" "Annotation Scale" "Annotation_Scale")))))

(defun sartd:v43-scale-choice-from-allowed (allowed target / best bestDen bestDiff v den diff exact)
  ; Returns (value denominator) using the exact allowed dropdown item if possible,
  ; otherwise the closest available allowed scale denominator.
  (setq target (float (sartd:scale-int target)))
  (setq best nil)
  (setq bestDen nil)
  (setq bestDiff nil)
  (setq exact nil)
  (foreach v allowed
    (setq den (sartd:v43-scale-denom-from-value v))
    (if (and den (>= den 1.0) (<= den 10000.0))
      (progn
        (setq diff (abs (- den target)))
        (cond
          ((= (sartd:scale-int den) (sartd:scale-int target))
            (setq exact (list (sartd:v43-unvariant v) (sartd:scale-int den))))
          ((or (not bestDiff) (< diff bestDiff) (and (= diff bestDiff) (> den bestDen)))
            (setq best (sartd:v43-unvariant v))
            (setq bestDen den)
            (setq bestDiff diff))))))
  (if exact exact (if best (list best (sartd:scale-int bestDen)) nil)))

(defun sartd:v43-put-custom-scale-dropdown (br den / props p allowed choice old val putres ok chosenDen)
  ; Sets the COG/Ground dynamic Custom > Scale dropdown.
  ; Tries the block's own AllowedValues first so AutoCAD gets a value it actually accepts.
  (setq ok nil)
  (setq chosenDen nil)
  (setq den (sartd:scale-int den))
  (setq props (sartd:dynprops-list br))
  (if props
    (foreach p props
      (if (and (not ok) (sartd:v43-scale-prop-p p))
        (progn
          (setq allowed (sartd:dyn-allowed p))
          (setq choice (if allowed (sartd:v43-scale-choice-from-allowed allowed den) nil))
          (if choice
            (progn
              (setq val (car choice))
              (setq chosenDen (cadr choice)))
            (progn
              ; No allowed-values list exposed. Try the common exact string formats.
              (setq val (strcat "1:" (sartd:scale-denom->string den)))
              (setq chosenDen den)))
          (setq old (vl-catch-all-apply 'vlax-get-property (list p 'Value)))
          (setq putres
            (if (vl-catch-all-error-p old)
              (vl-catch-all-apply 'vlax-put-property (list p 'Value val))
              (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value old val)))))
          (if (vl-catch-all-error-p putres)
            (if (not choice)
              (foreach val (list
                             (strcat "1/" (sartd:scale-denom->string den))
                             (float den)
                             den
                             (/ 1.0 (float den)))
                (if (not ok)
                  (progn
                    (setq putres
                      (if (vl-catch-all-error-p old)
                        (vl-catch-all-apply 'vlax-put-property (list p 'Value val))
                        (vl-catch-all-apply 'vlax-put-property (list p 'Value (sartd:coerce-value old val)))))
                    (if (not (vl-catch-all-error-p putres))
                      (progn (setq ok T) (setq chosenDen den)))))))
            (progn
              (setq ok T)
              (if (not chosenDen) (setq chosenDen den))))))))
  (if ok (list T (sartd:scale-int chosenDen)) nil))

(defun sartd:v43-scale-cog-ground (obj den / res used nm)
  ; Preferred behaviour for COG and Ground blocks:
  ;   - keep XYZ at 1:1;
  ;   - drive the block using Custom tab > Scale dropdown;
  ;   - if exact scale is not in the dropdown, use the closest allowed dropdown value.
  (setq den (sartd:scale-int den))
  (setq res (sartd:v43-put-custom-scale-dropdown obj den))
  (if res
    (progn
      (setq used (cadr res))
      (sartd:putprop-safe obj 'XScaleFactor 1.0)
      (sartd:putprop-safe obj 'YScaleFactor 1.0)
      (sartd:putprop-safe obj 'ZScaleFactor 1.0)
      (if (/= used den)
        (progn
          (setq nm (vl-catch-all-apply 'sartd:block-effective-name (list obj)))
          (if (vl-catch-all-error-p nm) (setq nm "COG/Ground block"))
          (sartd:pr (strcat "Note: " (sartd:str nm) " custom Scale dropdown has no 1:"
                            (sartd:scale-denom->string den) "; used closest available 1:"
                            (sartd:scale-denom->string used) ".")))))
    (progn
      ; Last resort only. This should rarely be used now.
      (setq nm (vl-catch-all-apply 'sartd:block-effective-name (list obj)))
      (if (vl-catch-all-error-p nm) (setq nm "COG/Ground block"))
      (sartd:pr (strcat "Warning: " (sartd:str nm) " has no usable Custom > Scale dropdown; using XYZ fallback for 1:"
                        (sartd:scale-denom->string den) "."))
      (sartd:putprop-safe obj 'XScaleFactor (float den))
      (sartd:putprop-safe obj 'YScaleFactor (float den))
      (sartd:putprop-safe obj 'ZScaleFactor (float den))))
  (vl-catch-all-apply 'vla-Update (list obj))
  res)

(defun sartd:scale-generated-callouts (scale / ss i ent obj role hText hView den)
  ; v43: Dims/text use viewport denominator. COG/Ground use their dynamic Custom > Scale dropdown.
  (setq den (sartd:scale-int scale))
  (setq hText (* 2.0 (float den)))
  (setq hView (* 2.0 (float den)))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq obj (vlax-ename->vla-object ent))
        (cond
          ((= role "COG")
            (sartd:v43-scale-cog-ground obj den))
          ((= role "GROUND_BLOCK")
            (sartd:v43-scale-cog-ground obj den))
          ((= role "COORDINATE")
            (sartd:putprop-safe obj 'XScaleFactor (float den))
            (sartd:putprop-safe obj 'YScaleFactor (float den))
            (sartd:putprop-safe obj 'ZScaleFactor (float den))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "PINNED_AXLE")
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "VIEW_LABEL")
            (sartd:putprop-safe obj 'Height hView)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "TEXT")
            (sartd:putprop-safe obj 'Height hText)
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "SARTDVS scaling applied. Dims/text set to viewport 1:"
                    (sartd:scale-denom->string den)
                    "; COG/Ground driven by their Custom > Scale dropdown where available.")))

(defun sartd:v43-layout-viewport-denom (/ lname vps vp sc)
  ; Read the actual current/last PaperSpace viewport denominator, ignoring silly 1:1/1:2 values.
  (setq sc nil)
  (setq lname (getenv "SARTD_LAST_LAYOUT"))
  (if (and lname (/= lname ""))
    (setq vps (vl-catch-all-apply 'sartd:layout-paper-viewports (list lname))))
  (if (or (not vps) (vl-catch-all-error-p vps))
    (if (= (getvar "TILEMODE") 0)
      (setq vps (vl-catch-all-apply 'sartd:current-layout-paper-viewports nil))))
  (if (and vps (not (vl-catch-all-error-p vps)))
    (progn
      (setq vp (sartd:largest-viewport vps))
      (if vp (setq sc (sartd:viewport-scale-from-object vp)))))
  (if (and sc (> (sartd:scale-int sc) 9)) (sartd:scale-int sc) nil))

(defun sartd:final-scale-denom (/ env mem vp)
  ; Final border scale source of truth.
  ; If the saved env value is bogus like 2, prefer the actual PaperSpace viewport scale.
  (setq env (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0))
  (setq mem (if (and (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale*) (sartd:scale-int sartd:*last-viewport-scale*) nil))
  (setq vp (sartd:v43-layout-viewport-denom))
  (cond
    ((and env (> env 9.0)) (sartd:scale-int env))
    ((and vp (> vp 9)) vp)
    ((and mem (> mem 9)) mem)
    (T (sartd:scale-int sartd:*default-callout-scale*))))

(defun sartd:current-border-scale-string (/ den)
  (setq den (sartd:final-scale-denom))
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:v43-force-scale-attrs-on-block (obj scaleStr / total atts a tag res)
  (setq total 0)
  (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
    (progn
      (setq atts (vl-catch-all-apply 'vlax-invoke (list obj 'GetAttributes)))
      (if (not (vl-catch-all-error-p atts))
        (foreach a (sartd:to-list atts)
          (setq tag (vl-catch-all-apply 'vla-get-TagString (list a)))
          (if (and (not (vl-catch-all-error-p tag)) (= (sartd:norm tag) (sartd:norm "SCALE")))
            (progn
              (setq res (vl-catch-all-apply 'vla-put-TextString (list a scaleStr)))
              (if (not (vl-catch-all-error-p res))
                (progn
                  (setq total (1+ total))
                  (vl-catch-all-apply 'vla-Update (list a))))))))))
  total)

(defun sartd:v43-force-border-scale-attributes (/ ps obj scaleStr total)
  ; Brutal final pass: any PaperSpace block attribute tagged SCALE receives the final viewport scale.
  ; This fixes imported template defaults such as 1:2 staying visible on the title block.
  (setq total 0)
  (setq scaleStr (sartd:current-border-scale-string))
  (vl-catch-all-apply 'sartd:go-paperspace nil)
  (setq ps (vl-catch-all-apply 'sartd:paperspace nil))
  (if (not (vl-catch-all-error-p ps))
    (vlax-for obj ps
      (setq total (+ total (sartd:v43-force-scale-attrs-on-block obj scaleStr)))))
  (if (> total 0)
    (sartd:pr (strcat "Border/title SCALE force-set " (itoa total) " attribute(s) to " scaleStr "."))
    (sartd:pr (strcat "Warning: no PaperSpace SCALE attribute found to force-set to " scaleStr ".")))
  total)

(defun sartd:update-border-scale-only ()
  (sartd:v43-force-border-scale-attributes))

(defun sartd:v42-scale-generated-after-vp-jump (den)
  ; v43 override: after the viewport scale is known, store it, scale generated items, then force title SCALE.
  (setq den (sartd:scale-int den))
  (setq sartd:*last-viewport-scale* den)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa den))
  (sartd:scale-generated-dims den)
  (sartd:scale-generated-callouts den)
  (sartd:v43-force-border-scale-attributes)
  den)

(defun sartd:run-border-auto-active (/ oldauto data result)
  ; v43: run normal title update, then brutally force SCALE from final viewport denominator afterwards.
  (vl-load-com)
  (sartd:pr (strcat "Starting border/title block update. Final viewport scale = " (sartd:current-border-scale-string) "."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (setq sartd:*auto-excel-source* oldauto)
  (cond
    ((or (vl-catch-all-error-p data) (not data))
      (if (vl-catch-all-error-p data)
        (sartd:pr (strcat "Warning: could not re-read Active Excel for border update: " (vl-catch-all-error-message data)))
        (sartd:pr "Warning: no Excel data returned for border update.")))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: full border/title update failed: " (vl-catch-all-error-message result))))))
  (sartd:v43-force-border-scale-attributes)
  (sartd:pr (strcat "Border/title block update complete. Border SCALE = " (sartd:current-border-scale-string) "."))
  T)

; Re-apply clean production command names after v43 overrides.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)

; v43.1: make manual SARTDBORDER use the same final SCALE force pass.
(defun sartd:run-border-update (/ data result)
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (if (and data (not (vl-catch-all-error-p data)))
    (progn
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: border/title update failed: " (vl-catch-all-error-message result)))))
    (sartd:pr "Warning: could not read Active Excel for full border/title update; forcing SCALE only."))
  (sartd:v43-force-border-scale-attributes)
  (sartd:go-paperspace)
  (princ))


; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.44 BORDER SCALE SOURCE-OF-TRUTH FIX
; Purpose:
;   - The title/border SCALE value now comes directly from the actual PaperSpace viewport object.
;   - After the viewport scale is applied, the program immediately reads that viewport CustomScale.
;   - That exact value is then written into every PaperSpace SCALE attribute on the active layout.
;   - This deliberately ignores stale template values such as 1:2 and does not use COG/Ground scale logic.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.44")

(defun sartd:v44-denom-from-viewport (vp / cs den)
  ; True drawing scale source: actual viewport CustomScale.
  ; Example: CustomScale 0.005 -> 1:200.
  (setq den nil)
  (if (and vp (sartd:floating-pviewport-p vp))
    (progn
      (setq cs (sartd:num (vl-catch-all-apply 'vlax-get-property (list vp 'CustomScale)) 0.0))
      (if (> cs 0.0)
        (setq den (sartd:scale-int (/ 1.0 cs))))))
  (if (and den (> den 9)) den nil))

(defun sartd:v44-current-layout-block (/ doc lay blk)
  ; More reliable than vla-get-PaperSpace because it targets the active layout block directly.
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq lay (vl-catch-all-apply 'vla-get-ActiveLayout (list doc)))
  (if (vl-catch-all-error-p lay)
    nil
    (progn
      (setq blk (vl-catch-all-apply 'vla-get-Block (list lay)))
      (if (vl-catch-all-error-p blk) nil blk))))

(defun sartd:v44-current-layout-main-viewport (/ blk out obj)
  ; Reads the largest real floating viewport from the active PaperSpace layout.
  (setq out nil)
  (if (= (getvar "TILEMODE") 0)
    (progn
      (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
      (setq blk (sartd:v44-current-layout-block))
      (if blk
        (vlax-for obj blk
          (if (sartd:floating-pviewport-p obj)
            (setq out (append out (list obj))))))))
  (if out (sartd:largest-viewport out) nil))

(defun sartd:v44-current-layout-viewport-denom (/ vp den)
  ; Read scale from the actual viewport on the active layout, ignoring template scales like 1:1 or 1:2.
  (setq vp (sartd:v44-current-layout-main-viewport))
  (setq den (if vp (sartd:v44-denom-from-viewport vp) nil))
  (if (and den (> den 9)) den nil))

(defun sartd:v44-scale-string (den)
  (strcat "1:" (sartd:scale-denom->string (sartd:scale-int den))))

(defun sartd:v44-register-scale (den / d)
  (setq d (sartd:scale-int den))
  (if (< d 10) (setq d (sartd:scale-int sartd:*default-callout-scale*)))
  (setq sartd:*last-viewport-scale* d)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa d))
  d)

(defun sartd:v44-register-scale-from-viewport (vp fallback / den)
  ; After vla-put-CustomScale, re-read the viewport itself. This is the source of truth.
  (setq den (sartd:v44-denom-from-viewport vp))
  (if (not den) (setq den (sartd:scale-int fallback)))
  (sartd:v44-register-scale den))

(defun sartd:v44-set-scale-attr-activex (obj scaleStr / total atts a tag res)
  ; First pass: normal ActiveX attribute update.
  (setq total 0)
  (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
    (progn
      (setq atts (vl-catch-all-apply 'vlax-invoke (list obj 'GetAttributes)))
      (if (not (vl-catch-all-error-p atts))
        (foreach a (sartd:to-list atts)
          (setq tag (vl-catch-all-apply 'vla-get-TagString (list a)))
          (if (and (not (vl-catch-all-error-p tag)) (= (sartd:norm tag) (sartd:norm "SCALE")))
            (progn
              (setq res (vl-catch-all-apply 'vla-put-TextString (list a scaleStr)))
              (if (not (vl-catch-all-error-p res))
                (progn
                  (setq total (1+ total))
                  (vl-catch-all-apply 'vla-Update (list a))))))))))
  total)

(defun sartd:v44-set-scale-attr-entnext (obj scaleStr / en next ed tag total newed)
  ; Second pass: raw entity fallback for stubborn title blocks.
  (setq total 0)
  (setq en (vl-catch-all-apply 'vlax-vla-object->ename (list obj)))
  (if (not (vl-catch-all-error-p en))
    (progn
      (setq next (entnext en))
      (while (and next (/= (cdr (assoc 0 (entget next))) "SEQEND"))
        (setq ed (entget next))
        (if (= (cdr (assoc 0 ed)) "ATTRIB")
          (progn
            (setq tag (cdr (assoc 2 ed)))
            (if (= (sartd:norm tag) (sartd:norm "SCALE"))
              (progn
                (setq newed
                  (if (assoc 1 ed)
                    (subst (cons 1 scaleStr) (assoc 1 ed) ed)
                    (append ed (list (cons 1 scaleStr)))))
                (if (entmod newed)
                  (progn
                    (setq total (1+ total))
                    (entupd en)))))))
        (setq next (entnext next)))))
  total)

(defun sartd:v44-force-scale-attrs-explicit (scaleStr / blk obj total a b doc)
  ; Brutal active-layout pass: every block attribute tagged SCALE gets the explicit viewport scale string.
  (setq total 0)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (vl-catch-all-apply 'sartd:go-paperspace nil)
  (setq blk (sartd:v44-current-layout-block))
  (if blk
    (vlax-for obj blk
      (if (= (strcase (sartd:str (vl-catch-all-apply 'vla-get-ObjectName (list obj)))) "ACDBBLOCKREFERENCE")
        (progn
          (setq a (sartd:v44-set-scale-attr-activex obj scaleStr))
          (setq b (sartd:v44-set-scale-attr-entnext obj scaleStr))
          (if (> (+ a b) 0)
            (progn
              (setq total (+ total 1))
              (vl-catch-all-apply 'vla-Update (list obj))))))))
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'vla-Regen (list doc 1))
  (if (> total 0)
    (sartd:pr (strcat "Border/title SCALE hard-forced from actual viewport to " scaleStr " on " (itoa total) " block(s)."))
    (sartd:pr (strcat "Warning: no active-layout SCALE attribute found to hard-force to " scaleStr ".")))
  total)

(defun sartd:v44-force-scale-from-viewport (vp fallback / den scaleStr)
  ; This is the important fix: border scale is written from the actual viewport CustomScale.
  (setq den (sartd:v44-register-scale-from-viewport vp fallback))
  (setq scaleStr (sartd:v44-scale-string den))
  (sartd:v44-force-scale-attrs-explicit scaleStr)
  den)

(defun sartd:v44-force-scale-from-current-layout (/ den scaleStr)
  ; Manual SARTDBORDER fallback: read the active layout's actual largest viewport.
  (setq den (sartd:v44-current-layout-viewport-denom))
  (if (not den)
    (setq den
      (cond
        ((and (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale* (> (sartd:scale-int sartd:*last-viewport-scale*) 9)) (sartd:scale-int sartd:*last-viewport-scale*))
        ((> (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0) 9.0) (sartd:scale-int (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0)))
        (T (sartd:scale-int sartd:*default-callout-scale*)))))
  (sartd:v44-register-scale den)
  (setq scaleStr (sartd:v44-scale-string den))
  (sartd:v44-force-scale-attrs-explicit scaleStr)
  den)

(defun sartd:final-scale-denom (/ vpden env mem)
  ; v44: active layout viewport first, memory/env only as fallback.
  (setq vpden (sartd:v44-current-layout-viewport-denom))
  (setq env (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0))
  (setq mem (if (and (boundp 'sartd:*last-viewport-scale*) sartd:*last-viewport-scale*) (sartd:scale-int sartd:*last-viewport-scale*) nil))
  (cond
    ((and vpden (> vpden 9)) (sartd:v44-register-scale vpden))
    ((and mem (> mem 9)) (sartd:v44-register-scale mem))
    ((and env (> env 9.0)) (sartd:v44-register-scale env))
    (T (sartd:v44-register-scale sartd:*default-callout-scale*))))

(defun sartd:current-border-scale-string (/ den)
  (setq den (sartd:final-scale-denom))
  (sartd:v44-scale-string den))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:update-border-scale-only ()
  ; Used by internal stages. It now reads the active layout viewport directly.
  (sartd:v44-force-scale-from-current-layout))

(defun sartd:v42-scale-generated-after-vp-jump (den)
  ; v44 override for calls that only have a denominator, not a viewport object.
  (setq den (sartd:v44-register-scale den))
  (sartd:scale-generated-dims den)
  (sartd:scale-generated-callouts den)
  (sartd:v44-force-scale-attrs-explicit (sartd:v44-scale-string den))
  den)

(defun sartd:v42-viewport-jump-then-scale-generated (vp raw / chosen actual)
  ; v44 shared SARTDVS/SARTDALL scale core.
  ; 1) choose next proper scale, 2) apply to viewport, 3) re-read actual viewport CustomScale,
  ; 4) scale generated items, 5) force border SCALE from that exact viewport value.
  (setq raw (sartd:num raw sartd:*default-callout-scale*))
  (setq chosen (sartd:v42-next-scale-up raw))
  (sartd:v42-apply-viewport-scale vp chosen)
  (setq actual (sartd:v44-register-scale-from-viewport vp chosen))
  (sartd:scale-generated-dims actual)
  (sartd:scale-generated-callouts actual)
  (sartd:v44-force-scale-from-viewport vp actual)
  (sartd:pr (strcat "Viewport scale source-of-truth fixed. Raw approx 1:" (rtos raw 2 2)
                    " -> chosen 1:" (sartd:scale-denom->string chosen)
                    "; actual viewport CustomScale reads as 1:" (sartd:scale-denom->string actual)
                    "; border SCALE forced to 1:" (sartd:scale-denom->string actual) "."))
  actual)

(defun sartd:scale-from-selected-viewport-only (/ vp raw den)
  ; SARTDVS manual command: selected viewport becomes the sole scale source of truth.
  (vl-load-com)
  (sartd:setup-layers)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (setq vp (sartd:strict-selected-paper-viewport "\nSelect PaperSpace viewport to read/round scale from: "))
  (if vp
    (progn
      (setq raw (sartd:v42-read-vp-raw-denom vp))
      (setq den (sartd:v42-viewport-jump-then-scale-generated vp raw))
      (sartd:pr (strcat "SARTDVS complete. Viewport and border SCALE now both = 1:" (sartd:scale-denom->string den) "."))))
  (princ))

(defun sartd:run-border-auto-active (/ oldauto data result den)
  ; v44: normal border data update, then final SCALE is forced from active layout viewport CustomScale.
  (vl-load-com)
  (sartd:pr (strcat "Starting border/title block update. Actual viewport scale source = " (sartd:current-border-scale-string) "."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (setq sartd:*auto-excel-source* oldauto)
  (cond
    ((or (vl-catch-all-error-p data) (not data))
      (if (vl-catch-all-error-p data)
        (sartd:pr (strcat "Warning: could not re-read Active Excel for border update: " (vl-catch-all-error-message data)))
        (sartd:pr "Warning: no Excel data returned for border update.")))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: full border/title update failed: " (vl-catch-all-error-message result))))))
  (setq den (sartd:v44-force-scale-from-current-layout))
  (sartd:pr (strcat "Border/title block update complete. Border SCALE = 1:" (sartd:scale-denom->string den) "."))
  T)

(defun sartd:run-border-update (/ data result den)
  ; Manual SARTDBORDER uses the same final source-of-truth pass.
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (if (and data (not (vl-catch-all-error-p data)))
    (progn
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: border/title update failed: " (vl-catch-all-error-message result)))))
    (sartd:pr "Warning: could not read Active Excel for full border/title update; forcing SCALE only."))
  (setq den (sartd:v44-force-scale-from-current-layout))
  (sartd:go-paperspace)
  (sartd:pr (strcat "SARTDBORDER complete. Border SCALE forced from actual viewport = 1:" (sartd:scale-denom->string den) "."))
  (princ))

; Re-apply clean production command names after v44 overrides.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.46 FINAL BORDER SCALE + LONG TRAIN VISUAL SPLIT FIX
; Purpose:
;   1) Border/title SCALE is forced at the very end from the exact viewport object used by SARTDVS/SARTDALL.
;      This prevents stale template values such as 1:2 being written after the viewport is actually 1:200.
;   2) K25/K24 dynamic trailer blocks are visually split when the Excel axle count exceeds the block limit.
;      Example: 66 axle lines -> 42 axle block + 24 axle continuation block.
;      Continuation blocks never get a left PPU; any right PPU is placed on the final continuation block.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.47")
(setq sartd:*dynamic-trailer-block-max-axles* 42)

(defun sartd:v46-trailer-block-max-axles (tr / s)
  ; Current K25 blocks are named 4 - 42 Axles. Use 42 as the safe dynamic-block limit.
  ; This also protects K24 if the workbook creates an over-long visual train line.
  (setq s (strcase (sartd:str (cdr (assoc 'type tr)))))
  (cond
    ((or (wcmatch s "*K2500*") (wcmatch s "*K25*") (wcmatch s "*K2400*") (wcmatch s "*K24*")) sartd:*dynamic-trailer-block-max-axles*)
    (T sartd:*dynamic-trailer-block-max-axles*)))

(defun sartd:v46-alist-set (lst key val / out done p)
  (setq out nil done nil)
  (foreach p lst
    (if (= (car p) key)
      (progn (setq out (append out (list (cons key val)))) (setq done T))
      (setq out (append out (list p)))))
  (if (not done) (setq out (append out (list (cons key val)))))
  out)

(defun sartd:v46-segment-ppu-state (tr idx count / ppul ppur)
  (setq ppul (cdr (assoc 'ppu-left tr)))
  (setq ppur (cdr (assoc 'ppu-right tr)))
  (cond
    ((<= count 1) (cdr (assoc 'ppu-state tr)))
    ((= idx 1) (if ppul "LEFT" "NONE"))
    ((= idx count) (if ppur "RIGHT" "NONE"))
    (T "NONE")))

(defun sartd:v46-segment-trailer (tr segAx segLen ppuState / out left right)
  (setq left (or (= (strcase (sartd:str ppuState)) "LEFT") (= (strcase (sartd:str ppuState)) "BOTH")))
  (setq right (or (= (strcase (sartd:str ppuState)) "RIGHT") (= (strcase (sartd:str ppuState)) "BOTH")))
  (setq out tr)
  (setq out (sartd:v46-alist-set out 'axles segAx))
  (setq out (sartd:v46-alist-set out 'length segLen))
  (setq out (sartd:v46-alist-set out 'ppu-state ppuState))
  (setq out (sartd:v46-alist-set out 'ppu-left left))
  (setq out (sartd:v46-alist-set out 'ppu-right right))
  out)

(defun sartd:v46-trailer-segments (tr / total maxAx sp fullLen pitch rem idx count segAx xoff segLen state out)
  ; Returns ((xoffset . <mm>) (trailer . <segment-trailer>) (axles . <n>) ...)
  (setq total (sartd:int (cdr (assoc 'axles tr)) 0))
  (setq maxAx (sartd:v46-trailer-block-max-axles tr))
  (setq sp (sartd:num (cdr (assoc 'spacing tr)) 0.0))
  (setq fullLen (sartd:num (cdr (assoc 'length tr)) 0.0))
  (if (and (> total 0) (> fullLen 0.0))
    (setq pitch (/ fullLen (float total)))
    (setq pitch sp))
  (if (> sp 1.0) (setq pitch sp))
  (if (<= pitch 1.0) (setq pitch 1500.0))
  (if (or (<= total 0) (<= maxAx 0) (<= total maxAx))
    (list (list (cons 'xoff 0.0) (cons 'axles total) (cons 'trailer tr)))
    (progn
      (setq count (fix (/ (+ total maxAx -1) maxAx)))
      (setq rem total idx 1 xoff 0.0 out nil)
      (while (> rem 0)
        (setq segAx (min maxAx rem))
        ; For the final segment, consume any tiny length difference so the total train length stays exact.
        (if (= idx count)
          (setq segLen (max 0.0 (- fullLen xoff)))
          (setq segLen (* (float segAx) pitch)))
        (if (<= segLen 1.0) (setq segLen (* (float segAx) pitch)))
        (setq state (sartd:v46-segment-ppu-state tr idx count))
        (setq out
          (append out
            (list
              (list
                (cons 'xoff xoff)
                (cons 'axles segAx)
                (cons 'length segLen)
                (cons 'ppu-state state)
                (cons 'trailer (sartd:v46-segment-trailer tr segAx segLen state))))))
        (setq xoff (+ xoff segLen))
        (setq rem (- rem segAx))
        (setq idx (1+ idx)))
      out)))

(defun sartd:draw-trailer-blocks-split (tr view base deck / segs seg segtr xoff x y br v total maxAx msg parts)
  ; Draw one or more chained dynamic trailer blocks for TOP/SIDE views.
  (setq v (strcase (sartd:str view)))
  (setq segs (sartd:v46-trailer-segments tr))
  (setq total (sartd:int (cdr (assoc 'axles tr)) 0))
  (setq maxAx (sartd:v46-trailer-block-max-axles tr))
  (if (and (= v "TOP") (> total maxAx))
    (progn
      (setq parts "")
      (foreach seg segs
        (setq parts (strcat parts (if (= parts "") "" " + ") (itoa (cdr (assoc 'axles seg))))))
      (sartd:pr (strcat "Trailer row " (itoa (cdr (assoc 'row tr))) " has " (itoa total)
                         " axle lines; visual dynamic blocks split as " parts " axles."))))
  (foreach seg segs
    (setq segtr (cdr (assoc 'trailer seg)))
    (setq xoff (sartd:num (cdr (assoc 'xoff seg)) 0.0))
    (cond
      ((= v "TOP")
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (+ (cadr base) (sartd:num (cdr (assoc 'y tr)) 0.0))))
      ((= v "SIDE")
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (+ (cadr base) deck)))
      (T
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (cadr base))))
    (setq br (sartd:insert-block (sartd:trailer-block-name segtr v) (list x y 0.0) "0"))
    (if br
      (sartd:configure-trailer-block br segtr v deck)))
  T)

(defun sartd:v46-record-final-viewport (vp den / h lay d)
  ; Store the exact viewport handle used for scale fitting. This prevents later passes from reading
  ; a different viewport or a stale template scale.
  (setq d (sartd:scale-int den))
  (setq sartd:*last-viewport-scale* d)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa d))
  (setenv "SARTD_FINAL_VIEWPORT_DENOM" (itoa d))
  (setq lay (getvar "CTAB"))
  (if lay (setenv "SARTD_FINAL_LAYOUT" lay))
  (if vp
    (progn
      (setq h (vl-catch-all-apply 'vla-get-Handle (list vp)))
      (if (not (vl-catch-all-error-p h)) (setenv "SARTD_FINAL_VIEWPORT_HANDLE" h))))
  d)

(defun sartd:v46-viewport-by-handle (/ doc h obj)
  (setq obj nil)
  (setq h (getenv "SARTD_FINAL_VIEWPORT_HANDLE"))
  (if (and h (/= h ""))
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq obj (vl-catch-all-apply 'vla-HandleToObject (list doc h)))
      (if (vl-catch-all-error-p obj) (setq obj nil))))
  obj)

(defun sartd:v46-final-viewport-object (/ vp lay vps)
  ; Priority 1 = exact viewport handle used by SARTDVS/SARTDALL.
  ; Priority 2 = largest viewport on the final layout.
  ; Priority 3 = largest viewport on the current layout.
  (setq vp (sartd:v46-viewport-by-handle))
  (if (and vp (sartd:floating-pviewport-p vp))
    vp
    (progn
      (setq lay (getenv "SARTD_FINAL_LAYOUT"))
      (if (or (not lay) (= lay "")) (setq lay (getenv "SARTD_LAST_LAYOUT")))
      (if (and lay (/= lay ""))
        (progn
          (sartd:activate-paper-layout lay)
          (setq vps (sartd:layout-paper-viewports lay))))
      (if (and vps (> (length vps) 0))
        (sartd:largest-viewport vps)
        (sartd:auto-viewport-from-current-layout)))))

(defun sartd:v46-final-scale-denom (/ vp den env last)
  (setq vp (sartd:v46-final-viewport-object))
  (setq den (if vp (sartd:v44-denom-from-viewport vp) nil))
  (setq env (sartd:num (getenv "SARTD_FINAL_VIEWPORT_DENOM") 0.0))
  (setq last (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0))
  (cond
    ((and den (> den 9)) (sartd:v46-record-final-viewport vp den))
    ((> env 9.0) (sartd:scale-int env))
    ((> last 9.0) (sartd:scale-int last))
    ((and (boundp 'sartd:*last-viewport-scale*) (> (sartd:scale-int sartd:*last-viewport-scale*) 9)) (sartd:scale-int sartd:*last-viewport-scale*))
    (T (sartd:scale-int sartd:*default-callout-scale*))))

(defun sartd:v46-force-scale-attrs-ssget (scaleStr / lay ss i en ed next aed tag newed count)
  ; Direct entity-level pass. This catches title blocks even if the ActiveX layout block scan misses them.
  (setq count 0)
  (setq lay (getvar "CTAB"))
  (if (and lay (/= lay ""))
    (progn
      (setq ss (ssget "_X" (list (cons 0 "INSERT") (cons 410 lay))))
      (if ss
        (progn
          (setq i 0)
          (while (< i (sslength ss))
            (setq en (ssname ss i))
            (setq ed (entget en))
            (if (= (cdr (assoc 66 ed)) 1)
              (progn
                (setq next (entnext en))
                (while (and next (/= (cdr (assoc 0 (entget next))) "SEQEND"))
                  (setq aed (entget next))
                  (if (= (cdr (assoc 0 aed)) "ATTRIB")
                    (progn
                      (setq tag (cdr (assoc 2 aed)))
                      (if (= (sartd:norm tag) "SCALE")
                        (progn
                          (setq newed
                            (if (assoc 1 aed)
                              (subst (cons 1 scaleStr) (assoc 1 aed) aed)
                              (append aed (list (cons 1 scaleStr)))))
                          (if (entmod newed)
                            (progn
                              (setq count (1+ count))
                              (entupd en)))))))
                  (setq next (entnext next)))))
            (setq i (1+ i)))))))
  count)

(defun sartd:v46-force-border-scale-final (reason / lay vp den scaleStr a b doc)
  ; Final authoritative border scale write.
  ; Always called after viewport fitting and again after the normal border/title data update.
  (vl-load-com)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (setq lay (getenv "SARTD_FINAL_LAYOUT"))
  (if (or (not lay) (= lay "")) (setq lay (getenv "SARTD_LAST_LAYOUT")))
  (if (and lay (/= lay "")) (sartd:activate-paper-layout lay))
  (vl-catch-all-apply 'sartd:go-paperspace nil)
  (setq vp (sartd:v46-final-viewport-object))
  (setq den (sartd:v46-final-scale-denom))
  (setq scaleStr (strcat "1:" (sartd:scale-denom->string den)))
  ; Make sure memory/env agree with the value being written.
  (sartd:v46-record-final-viewport vp den)
  ; Existing ActiveX/raw block scan.
  (if (fboundp 'sartd:v44-force-scale-attrs-explicit)
    (setq a (sartd:v44-force-scale-attrs-explicit scaleStr))
    (setq a 0))
  ; Extra direct selection-set pass on the active layout.
  (setq b (sartd:v46-force-scale-attrs-ssget scaleStr))
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'vla-Regen (list doc 1))
  (sartd:pr (strcat (if reason reason "Final") " border SCALE check: actual final viewport = " scaleStr
                    "; forced SCALE attribute(s) by layout scan = " (itoa b) "."))
  den)

(defun sartd:current-border-scale-string (/ den)
  ; v46: attribute map uses the final stored/actual viewport scale, not the current viewport or template value.
  (setq den (sartd:v46-final-scale-denom))
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:v42-viewport-jump-then-scale-generated (vp raw / chosen actual)
  ; v46 shared SARTDVS/SARTDALL scale core.
  ; The exact viewport object is recorded so the border update at the very end cannot read the wrong scale.
  (setq raw (sartd:num raw sartd:*default-callout-scale*))
  (setq chosen (sartd:v42-next-scale-up raw))
  (sartd:v42-apply-viewport-scale vp chosen)
  (setq actual (sartd:v44-register-scale-from-viewport vp chosen))
  (sartd:v46-record-final-viewport vp actual)
  (sartd:scale-generated-dims actual)
  (sartd:scale-generated-callouts actual)
  (sartd:v46-force-border-scale-final "Viewport scale stage")
  (sartd:pr (strcat "Viewport scale fixed. Raw approx 1:" (rtos raw 2 2)
                    " -> chosen 1:" (sartd:scale-denom->string chosen)
                    "; actual viewport reads 1:" (sartd:scale-denom->string actual)
                    "; border SCALE forced at end-source to 1:" (sartd:scale-denom->string actual) "."))
  actual)

(defun sartd:update-border-scale-only ()
  (sartd:v46-force-border-scale-final "Update-border-scale-only")
)

(defun sartd:run-border-auto-active (/ oldauto data result den)
  ; v46: normal border/title update first, then final SCALE is overwritten from the exact final viewport.
  (vl-load-com)
  (sartd:pr (strcat "Starting border/title block update. Final viewport scale source = " (sartd:current-border-scale-string) "."))
  (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
  (setq sartd:*auto-excel-source* "Active")
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (setq sartd:*auto-excel-source* oldauto)
  (cond
    ((or (vl-catch-all-error-p data) (not data))
      (if (vl-catch-all-error-p data)
        (sartd:pr (strcat "Warning: could not re-read Active Excel for border update: " (vl-catch-all-error-message data)))
        (sartd:pr "Warning: no Excel data returned for border update.")))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: full border/title update failed: " (vl-catch-all-error-message result))))))
  (setq den (sartd:v46-force-border-scale-final "SARTDALL final border/title update"))
  (sartd:pr (strcat "Border/title block update complete. Border SCALE = 1:" (sartd:scale-denom->string den) "."))
  T)

(defun sartd:run-border-update (/ data result den)
  ; Manual SARTDBORDER: update all data, then force SCALE from the final/active viewport.
  (vl-load-com)
  (sartd:setup-layers)
  (sartd:go-paperspace)
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (if (and data (not (vl-catch-all-error-p data)))
    (progn
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: border/title update failed: " (vl-catch-all-error-message result)))))
    (sartd:pr "Warning: could not read Active Excel for full border/title update; forcing SCALE only."))
  (setq den (sartd:v46-force-border-scale-final "SARTDBORDER final"))
  (sartd:go-paperspace)
  (sartd:pr (strcat "SARTDBORDER complete. Border SCALE forced from final viewport = 1:" (sartd:scale-denom->string den) "."))
  (princ))

; Re-apply clean production command names after v46 overrides.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]




; =================================================================================================
; v0.9.9.4.3.47 SCALE TEXT ZERO FIX + K25 HYDRAULIC GROUP Y-PITCH FIX
; Purpose:
;   1) Fix border/title SCALE text so denominators ending in zero are not shortened.
;      Older sartd:scale-denom->string stripped any trailing zero if RTOS returned "250"/"400"
;      instead of "250.000000"/"400.000000" under the user's AutoCAD zero-suppression settings.
;      Result was wrong title text such as 1:25 instead of 1:250 and 1:4 instead of 1:400.
;      This override treats scale denominators as whole-number drawing scales and uses ITOA.
;   2) Fix K25/K2500 hydraulic group square Y spacing. K25 rows are 1800mm apart in Y.
;      X pitch still comes from the Excel spacing value, normally 1500mm for K25.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.47")

(defun sartd:scale-denom->string (den / n)
  ; v47: preserve significant trailing zeros in integer scale denominators.
  ; Examples: 200 -> "200", 250 -> "250", 400 -> "400".
  ; Do not use the old generic trailing-zero trim here; title block SCALE values are identifiers.
  (setq n (sartd:scale-int den))
  (itoa n))

(defun sartd:trailer-row-pitch (tr / w)
  ; v47: K25/K2500 plan-view hydraulic/group row pitch is fixed at 1800mm.
  ; K24 keeps the previous width/2 logic, falling back to the original K24 row pitch.
  (cond
    ((sartd:trailer-k25-p tr) 1800.0)
    (T
      (setq w (cdr (assoc 'width tr)))
      (if (and w (> (abs w) 1.0)) (/ w 2.0) sartd:*k24-group-y-spacing*))))

(defun sartd:trailer-lower-row-offset (tr)
  ; Keeps the trailer Excel Y position as the row centreline, with lower/top rows +/- half pitch.
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:v47-force-border-scale-final (reason / den)
  ; Wrapper around the v46 authoritative viewport check, now using the v47 non-trimming scale text.
  (setq den (sartd:v46-force-border-scale-final reason))
  (sartd:pr (strcat "v47 check: border SCALE text uses preserved denominator zeros = 1:" (sartd:scale-denom->string den) "."))
  den)

; Rebind the public commands so their final border-scale pass uses the v47 wrapper.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.48 K25 AXLE DIMENSION STYLE + SCALE TEXT ZERO HARDENING
; Purpose:
;   1) The side-view axle-length dimension must use the SPMT pitch dimstyle only.
;      Do not write manual bracket text like [66 x 1500] into the dimension override.
;      The dimstyle supplies that display. This prevents duplicated text.
;   2) K25/K2500 axle/group plan markers use 1500mm in X and 1800mm row pitch in Y.
;   3) Keep the v47 border SCALE fix so 1:250 does not become 1:25 and 1:400 does not become 1:4.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.48")
(setq sartd:*dimstyle-k25-axle* "SAR_DIM_SPMT_1500")

(defun sartd:scale-denom->string (den / n)
  ; v48: scale labels are identifiers, not decimal numbers. Never trim trailing zeros.
  ; Examples: 200 -> "200", 250 -> "250", 400 -> "400".
  (setq n (sartd:scale-int den))
  (itoa n))

(defun sartd:v48-string-contains (hay needle / h n)
  (setq h (strcase (sartd:str hay)))
  (setq n (strcase (sartd:str needle)))
  (and (/= n "") (vl-string-search n h)))

(defun sartd:v48-axle-dimstyle-from-text (style txt / st)
  ; The older drawing function passes SAR_DIM_SPMT_1400 for all axle-length dims.
  ; Use the embedded pitch text to select the correct style, then remove the override text.
  (setq st (sartd:str style))
  (cond
    ((sartd:v48-string-contains txt "1500") sartd:*dimstyle-k25-axle*)
    ((sartd:v48-string-contains txt "1400") sartd:*dimstyle-k24-axle*)
    ((= (sartd:norm st) (sartd:norm sartd:*dimstyle-k25-axle*)) sartd:*dimstyle-k25-axle*)
    ((= (sartd:norm st) (sartd:norm sartd:*dimstyle-k24-axle*)) sartd:*dimstyle-k24-axle*)
    (T st)))

(defun sartd:v48-axle-dimstyle-p (style / st)
  (setq st (sartd:norm (sartd:str style)))
  (or (= st (sartd:norm sartd:*dimstyle-k24-axle*))
      (= st (sartd:norm sartd:*dimstyle-k25-axle*))))

(defun sartd:draw-dim-h-style (x1 x2 y off txt style / yy useStyle useTxt obj)
  ; v48 override.
  ; For SPMT axle-length dimensions, do NOT write manual text such as:
  ;   99000 [66 x 1500]
  ; Leave TextOverride blank so the selected SAR_DIM_SPMT_1500 / SAR_DIM_SPMT_1400
  ; dimstyle controls the final annotation itself.
  (setq yy (+ y off))
  (setq useStyle (sartd:v48-axle-dimstyle-from-text style txt))
  (setq useTxt txt)
  (if (sartd:v48-axle-dimstyle-p useStyle)
    (setq useTxt ""))
  (setq obj (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 useTxt useStyle))
  obj)

(defun sartd:trailer-row-pitch (tr / w)
  ; v48: K25/K2500 block axle rows are 1800mm apart in Y.
  ; K24 keeps width/2 behaviour, normally 1450mm.
  (cond
    ((sartd:trailer-k25-p tr) 1800.0)
    (T
      (setq w (cdr (assoc 'width tr)))
      (if (and w (> (abs w) 1.0)) (/ w 2.0) sartd:*k24-group-y-spacing*))))

(defun sartd:trailer-x-pitch (tr / sp)
  ; v48: K25/K2500 uses 1500mm axle pitch in X. Prefer Excel if valid, otherwise force K25 fallback.
  (setq sp (cdr (assoc 'spacing tr)))
  (cond
    ((and sp (> (abs sp) 1.0)) sp)
    ((sartd:trailer-k25-p tr) 1500.0)
    (T sartd:*k24-group-x-spacing*)))

(defun sartd:trailer-lower-row-offset (tr)
  ; Lower row is half the row-to-row pitch below the trailer centreline.
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:v48-force-border-scale-final (reason / den)
  ; Wrapper around the v46 authoritative viewport check, using the v48 non-trimming scale text.
  (setq den (sartd:v46-force-border-scale-final reason))
  (sartd:pr (strcat "v48 check: border SCALE denominator preserved = 1:" (sartd:scale-denom->string den) "."))
  den)

; Rebind the clean public commands so the final pass always runs after all other updates.

; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)

; =================================================================================================
; v0.9.9.4.3.49 HARD FIX - SCALE TEXT, K25 AXLE DIM, K25 GROUP Y PITCH
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.49")
(setq sartd:*dimstyle-k25-axle* "SAR_DIM_SPMT_1500")

(defun sartd:v49-scale-denom-text (den / n)
  (setq n (fix (+ 0.5 (abs (sartd:num den sartd:*default-callout-scale*)))))
  (if (< n 10) (setq n (fix sartd:*default-callout-scale*)))
  (itoa n))

(defun sartd:scale-denom->string (den)
  (sartd:v49-scale-denom-text den))

(defun sartd:v49-scale-label (den)
  (strcat "1:" (sartd:v49-scale-denom-text den)))

(defun sartd:v49-record-final-scale-text (den / d label)
  (setq d (sartd:scale-int den))
  (setq label (sartd:v49-scale-label d))
  (setq sartd:*last-viewport-scale* d)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa d))
  (setenv "SARTD_FINAL_VIEWPORT_DENOM" (itoa d))
  (setenv "SARTD_FINAL_SCALE_TEXT" label)
  label)

(defun sartd:v49-attr-scale-tag-p (tag / tnorm)
  (setq tnorm (sartd:norm (sartd:str tag)))
  (or (= tnorm "SCALE") (= tnorm "DRAWSCALE") (= tnorm "DRAWINGSCALE") (= tnorm "DWGSCALE")))

(defun sartd:v49-set-scale-attref (att scaleStr / tag res)
  (setq tag (vl-catch-all-apply 'vla-get-TagString (list att)))
  (if (and (not (vl-catch-all-error-p tag)) (sartd:v49-attr-scale-tag-p tag))
    (progn
      (setq res (vl-catch-all-apply 'vla-put-TextString (list att scaleStr)))
      (vl-catch-all-apply 'vlax-put-property (list att 'MTextAttributeContent scaleStr))
      (vl-catch-all-apply 'vla-Update (list att))
      (if (vl-catch-all-error-p res) 0 1))
    0))

(defun sartd:v49-force-scale-activex-insert (en scaleStr / obj atts a count)
  (setq count 0)
  (setq obj (vl-catch-all-apply 'vlax-ename->vla-object (list en)))
  (if (not (vl-catch-all-error-p obj))
    (progn
      (setq atts (vl-catch-all-apply 'vlax-invoke (list obj 'GetAttributes)))
      (if (not (vl-catch-all-error-p atts))
        (foreach a (sartd:to-list atts)
          (setq count (+ count (sartd:v49-set-scale-attref a scaleStr)))))))
  count)

(defun sartd:v49-force-scale-raw-insert (en scaleStr / ed next aed tag newed count)
  (setq count 0)
  (setq ed (entget en))
  (if (= (cdr (assoc 66 ed)) 1)
    (progn
      (setq next (entnext en))
      (while (and next (/= (cdr (assoc 0 (entget next))) "SEQEND"))
        (setq aed (entget next))
        (if (= (cdr (assoc 0 aed)) "ATTRIB")
          (progn
            (setq tag (cdr (assoc 2 aed)))
            (if (sartd:v49-attr-scale-tag-p tag)
              (progn
                (setq newed
                  (if (assoc 1 aed)
                    (subst (cons 1 scaleStr) (assoc 1 aed) aed)
                    (append aed (list (cons 1 scaleStr)))))
                (if (entmod newed)
                  (progn
                    (setq count (1+ count))
                    (entupd en)))))))
        (setq next (entnext next)))))
  count)

(defun sartd:v49-force-scale-attributes-on-layout (scaleStr / lay ss i en count doc)
  (setq count 0)
  (setq lay (getvar "CTAB"))
  (if (and lay (/= lay "") (= (getvar "TILEMODE") 0))
    (progn
      (setq ss (ssget "_X" (list (cons 0 "INSERT") (cons 410 lay))))
      (if ss
        (progn
          (setq i 0)
          (while (< i (sslength ss))
            (setq en (ssname ss i))
            (setq count (+ count (sartd:v49-force-scale-activex-insert en scaleStr)))
            (setq count (+ count (sartd:v49-force-scale-raw-insert en scaleStr)))
            (setq i (1+ i)))))))
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'vla-Regen (list doc 1))
  count)

(defun sartd:v49-final-scale-denom (/ env last vp den)
  (setq env (sartd:num (getenv "SARTD_FINAL_VIEWPORT_DENOM") 0.0))
  (cond
    ((> env 9.0) (sartd:scale-int env))
    (T
      (setq vp (if (fboundp 'sartd:v46-final-viewport-object) (sartd:v46-final-viewport-object) nil))
      (setq den (if (and vp (fboundp 'sartd:v44-denom-from-viewport)) (sartd:v44-denom-from-viewport vp) nil))
      (cond
        ((and den (> den 9.0)) (sartd:scale-int den))
        ((> (setq last (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0)) 9.0) (sartd:scale-int last))
        (T (sartd:scale-int sartd:*default-callout-scale*))))))

(defun sartd:v49-force-border-scale-final (reason / lay den scaleStr cnt)
  (vl-load-com)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (setq lay (getenv "SARTD_FINAL_LAYOUT"))
  (if (or (not lay) (= lay "")) (setq lay (getenv "SARTD_LAST_LAYOUT")))
  (if (and lay (/= lay "")) (vl-catch-all-apply 'sartd:activate-paper-layout (list lay)))
  (vl-catch-all-apply 'sartd:go-paperspace nil)
  (setq den (sartd:v49-final-scale-denom))
  (setq scaleStr (sartd:v49-record-final-scale-text den))
  (setq cnt (sartd:v49-force-scale-attributes-on-layout scaleStr))
  (sartd:pr (strcat (if reason reason "Final") " border SCALE forced to " scaleStr " using preserved denominator text; attributes touched = " (itoa cnt) "."))
  den)

(defun sartd:current-border-scale-string (/ txt den)
  (setq txt (getenv "SARTD_FINAL_SCALE_TEXT"))
  (if (and txt (/= txt ""))
    txt
    (progn
      (setq den (sartd:v49-final-scale-denom))
      (sartd:v49-scale-label den))))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:v42-viewport-jump-then-scale-generated (vp raw / chosen)
  (setq raw (sartd:num raw sartd:*default-callout-scale*))
  (setq chosen (sartd:v42-next-scale-up raw))
  (sartd:v42-apply-viewport-scale vp chosen)
  (if (fboundp 'sartd:v46-record-final-viewport) (sartd:v46-record-final-viewport vp chosen))
  (sartd:v49-record-final-scale-text chosen)
  (sartd:scale-generated-dims chosen)
  (sartd:scale-generated-callouts chosen)
  (sartd:v49-force-border-scale-final "Viewport scale stage")
  (sartd:pr (strcat "Viewport scale fixed. Raw approx 1:" (rtos raw 2 2)
                    " -> chosen/applied " (sartd:v49-scale-label chosen)
                    "; border SCALE forced to " (sartd:v49-scale-label chosen) "."))
  chosen)

(defun sartd:v49-string-contains (hay needle / h n)
  (setq h (strcase (sartd:str hay)))
  (setq n (strcase (sartd:str needle)))
  (and (/= n "") (vl-string-search n h)))

(defun sartd:v49-spmt-style-p (style / st)
  (setq st (sartd:norm (sartd:str style)))
  (or (= st (sartd:norm sartd:*dimstyle-k24-axle*))
      (= st (sartd:norm sartd:*dimstyle-k25-axle*))))

(defun sartd:v49-style-from-spmt-text (style txt / st)
  (setq st (sartd:str style))
  (cond
    ((or (sartd:v49-string-contains txt "x 1500") (sartd:v49-string-contains txt "x1500") (sartd:v49-string-contains txt "1500")) sartd:*dimstyle-k25-axle*)
    ((or (sartd:v49-string-contains txt "x 1400") (sartd:v49-string-contains txt "x1400") (sartd:v49-string-contains txt "1400")) sartd:*dimstyle-k24-axle*)
    ((sartd:v49-spmt-style-p st) st)
    (T st)))

(defun sartd:v49-clear-dim-text-override (obj / en ed newed)
  (if obj
    (progn
      (vl-catch-all-apply 'vla-put-TextOverride (list obj ""))
      (setq en (vl-catch-all-apply 'vlax-vla-object->ename (list obj)))
      (if (not (vl-catch-all-error-p en))
        (progn
          (setq ed (entget en))
          (setq newed (if (assoc 1 ed) (subst (cons 1 "") (assoc 1 ed) ed) (append ed (list (cons 1 "")))))
          (entmod newed)
          (entupd en)))
      (vl-catch-all-apply 'vla-Update (list obj))))
  obj)

(defun sartd:add-linear-dim-style (p1 p2 loc rot txt style / useStyle useTxt obj)
  (setq useStyle (sartd:v49-style-from-spmt-text style txt))
  (setq useTxt txt)
  (if (sartd:v49-spmt-style-p useStyle) (setq useTxt ""))
  (setq obj (sartd:add-linear-dim p1 p2 loc rot useTxt))
  (if obj (sartd:set-dim-style obj useStyle))
  (if (and obj (sartd:v49-spmt-style-p useStyle)) (sartd:v49-clear-dim-text-override obj))
  obj)

(defun sartd:draw-dim-h-style (x1 x2 y off txt style / yy)
  (setq yy (+ y off))
  (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 txt style))

(defun sartd:trailer-x-pitch (tr / sp)
  (setq sp (cdr (assoc 'spacing tr)))
  (cond
    ((sartd:trailer-k25-p tr) 1500.0)
    ((and sp (> (abs sp) 1.0)) sp)
    (T sartd:*k24-group-x-spacing*)))

(defun sartd:trailer-row-pitch (tr / w)
  (cond
    ((sartd:trailer-k25-p tr) 1800.0)
    (T
      (setq w (cdr (assoc 'width tr)))
      (if (and w (> (abs w) 1.0)) (/ w 2.0) sartd:*k24-group-y-spacing*))))

(defun sartd:trailer-lower-row-offset (tr)
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:draw-hydraulic-groups (data planBase / trailers hdefs tr idx hds hd ax axCount xPitch yPitch x0 y0 x y grp b br gmap sideName skippedPins planPinnedDrawn planPinnedMissing)
  (setq trailers (sartd:g 'trailers data))
  (setq hdefs (sartd:g 'hydraulic-grouping data))
  (setq idx 1)
  (setq skippedPins 0)
  (setq planPinnedDrawn 0)
  (setq planPinnedMissing 0)
  (setq gmap nil)
  (foreach tr trailers
    (setq hds nil)
    (foreach hd hdefs
      (if (= (cdr (assoc 'trailer-index hd)) idx)
        (setq hds (append hds (list hd)))))
    (setq axCount (cdr (assoc 'axles tr)))
    (setq xPitch (sartd:trailer-x-pitch tr))
    (setq yPitch (sartd:trailer-row-pitch tr))
    (setq x0 (+ (car planBase) (cdr (assoc 'x tr)) (sartd:trailer-first-axle-offset tr)))
    (setq y0 (+ (cadr planBase) (cdr (assoc 'y tr)) (sartd:trailer-lower-row-offset tr)))
    (foreach hd hds
      (setq ax 1)
      (while (<= ax axCount)
        (setq x (+ x0 (* (1- ax) xPitch)))
        (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
        (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))
        (if (sartd:axle-pinned-p data idx ax)
          (progn
            (setq skippedPins (1+ skippedPins))
            (if (tblsearch "BLOCK" sartd:*block-pinned-axle-plan*)
              (progn
                (setq br (sartd:insert-block sartd:*block-pinned-axle-plan* (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_PLAN")
                    (setq planPinnedDrawn (1+ planPinnedDrawn)))))
              (setq planPinnedMissing (1+ planPinnedMissing))))
          (progn
            (setq grp (sartd:hyd-group-at-axle hd ax))
            (setq b (sartd:group-block-name grp))
            (if (and b (tblsearch "BLOCK" b))
              (progn
                (setq br (sartd:insert-block b (list x y 0.0) "SARTD-HYD-GROUP"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) (strcat "HYD_GROUP_" (itoa grp)))
                    (setq gmap (sartd:gmap-add gmap grp (list x y)))))))))
        (setq ax (1+ ax))))
    (if (sartd:trailer-k25-p tr)
      (sartd:pr (strcat "K25 hydraulic group pitch applied on trailer row " (itoa (cdr (assoc 'row tr))) ": X=1500, Y=1800.")))
    (setq idx (1+ idx)))
  (if gmap (sartd:draw-hydraulic-triangle gmap))
  (if (or gmap (> planPinnedDrawn 0))
    (progn
      (if gmap (sartd:pr "Hydraulic group squares drawn from Excel grouping table using final SARTD pitch logic."))
      (if (> skippedPins 0) (sartd:pr (strcat "Pinned / closed-off axle positions skipped from hydraulic groups and stability triangle: " (itoa skippedPins))))
      (if (> planPinnedDrawn 0) (sartd:pr (strcat "Top-view pinned axle blocks inserted in place of plan group squares: " (itoa planPinnedDrawn))))
      (if (> planPinnedMissing 0) (sartd:pr "TV_K24_Pinned_Axle block not found; pinned plan markers were skipped.")))
    (sartd:pr "No hydraulic group squares drawn. Check grouping rows 138 onwards and group block names.")))


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)

; =================================================================================================
; v0.9.9.4.3.50 REAL FIX - LOADS CLEANLY + SCALE ZEROES + K25 GROUP/DIM OVERRIDES
; -------------------------------------------------------------------------------------------------
; v49 did not load because v46 had one extra closing parenthesis in sartd:draw-trailer-blocks-split.
; This file has that syntax error corrected, so the later fixes actually load.
; This final override also refuses to trust old stale SARTD_FINAL_SCALE_TEXT values like 1:4.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.50")
(setq sartd:*dimstyle-k25-axle* "SAR_DIM_SPMT_1500")

(defun sartd:v50-scale-int (x / n)
  (setq n (fix (+ 0.5 (abs (sartd:num x sartd:*default-callout-scale*)))))
  (if (< n 10) (setq n (fix (+ 0.5 sartd:*default-callout-scale*))))
  n)

(defun sartd:scale-denom->string (den)
  ; Scale labels are text identifiers. Never strip trailing zeroes.
  ; 250 -> "250", 400 -> "400".
  (itoa (sartd:v50-scale-int den)))

(defun sartd:v50-scale-label (den)
  (strcat "1:" (sartd:scale-denom->string den)))

(defun sartd:v50-clear-scale-cache ()
  ; Remove stale values from earlier broken runs, especially SARTD_FINAL_SCALE_TEXT = 1:4.
  (setenv "SARTD_FINAL_SCALE_TEXT" "")
  (setenv "SARTD_FINAL_VIEWPORT_DENOM" "")
  (setenv "SARTD_FINAL_VIEWPORT_HANDLE" "")
  (setenv "SARTD_FINAL_LAYOUT" ""))

(defun sartd:v50-record-final-scale (den / d txt)
  (setq d (sartd:v50-scale-int den))
  (setq txt (sartd:v50-scale-label d))
  (setq sartd:*last-viewport-scale* d)
  (setenv "SARTD_LAST_VIEWPORT_SCALE" (itoa d))
  (setenv "SARTD_FINAL_VIEWPORT_DENOM" (itoa d))
  (setenv "SARTD_FINAL_SCALE_TEXT" txt)
  txt)

(defun sartd:v50-final-scale-denom (/ vp den env last)
  ; Source priority:
  ; 1. Actual final viewport CustomScale.
  ; 2. Stored numeric denominator from current run.
  ; 3. Last viewport scale.
  ; Never use stored formatted text as the source of truth.
  (setq vp (if (fboundp 'sartd:v46-final-viewport-object) (sartd:v46-final-viewport-object) nil))
  (setq den (if (and vp (fboundp 'sartd:v44-denom-from-viewport)) (sartd:v44-denom-from-viewport vp) nil))
  (cond
    ((and den (> den 9.0)) (sartd:v50-scale-int den))
    ((> (setq env (sartd:num (getenv "SARTD_FINAL_VIEWPORT_DENOM") 0.0)) 9.0) (sartd:v50-scale-int env))
    ((> (setq last (sartd:num (getenv "SARTD_LAST_VIEWPORT_SCALE") 0.0)) 9.0) (sartd:v50-scale-int last))
    ((and (boundp 'sartd:*last-viewport-scale*) (> (sartd:num sartd:*last-viewport-scale* 0.0) 9.0)) (sartd:v50-scale-int sartd:*last-viewport-scale*))
    (T (sartd:v50-scale-int sartd:*default-callout-scale*))))

(defun sartd:v49-final-scale-denom ()
  ; Override v49 with the v50 actual-viewport-first reader.
  (sartd:v50-final-scale-denom))

(defun sartd:current-border-scale-string (/ den)
  ; Always regenerate text from the numeric denominator so 400 cannot become 4.
  (setq den (sartd:v50-final-scale-denom))
  (sartd:v50-record-final-scale den))

(defun sartd:border-scale-map (/)
  (list (cons "SCALE" (sartd:current-border-scale-string))))

(defun sartd:v50-force-border-scale-final (reason / den scaleStr cnt lay)
  (vl-load-com)
  (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace nil)
  (setq lay (getenv "SARTD_FINAL_LAYOUT"))
  (if (or (not lay) (= lay "")) (setq lay (getenv "SARTD_LAST_LAYOUT")))
  (if (and lay (/= lay "")) (vl-catch-all-apply 'sartd:activate-paper-layout (list lay)))
  (vl-catch-all-apply 'sartd:go-paperspace nil)
  (setq den (sartd:v50-final-scale-denom))
  (setq scaleStr (sartd:v50-record-final-scale den))
  (setq cnt (sartd:v49-force-scale-attributes-on-layout scaleStr))
  (sartd:pr (strcat (if reason reason "Final") " border/title SCALE forced from actual final viewport to " scaleStr "; attributes touched = " (itoa cnt) "."))
  den)

(defun sartd:v42-viewport-jump-then-scale-generated (vp raw / chosen actual)
  ; Final shared viewport scale stage.
  ; raw is the fitted denominator, e.g. 345.82. chosen becomes 400, not 4.
  (setq raw (sartd:num raw sartd:*default-callout-scale*))
  (setq chosen (sartd:v42-next-scale-up raw))
  (sartd:v42-apply-viewport-scale vp chosen)
  (setq actual (if (fboundp 'sartd:v44-denom-from-viewport) (sartd:v44-denom-from-viewport vp) nil))
  (if (not actual) (setq actual chosen))
  (if (fboundp 'sartd:v46-record-final-viewport) (sartd:v46-record-final-viewport vp actual))
  (sartd:v50-record-final-scale actual)
  (sartd:scale-generated-dims actual)
  (sartd:scale-generated-callouts actual)
  (sartd:v50-force-border-scale-final "Viewport scale stage")
  (sartd:pr (strcat "Viewport scale fixed. Raw approx 1:" (rtos raw 2 2)
                    " -> chosen/applied " (sartd:v50-scale-label actual)
                    "; border SCALE forced to " (sartd:v50-scale-label actual) "."))
  actual)

(defun sartd:v50-string-contains (hay needle / h n)
  (setq h (strcase (sartd:str hay)))
  (setq n (strcase (sartd:str needle)))
  (and (/= n "") (vl-string-search n h)))

(defun sartd:v50-spmt-style-p (style / st)
  (setq st (sartd:norm (sartd:str style)))
  (or (= st (sartd:norm sartd:*dimstyle-k24-axle*))
      (= st (sartd:norm sartd:*dimstyle-k25-axle*))))

(defun sartd:v50-style-from-spmt-text (style txt / st)
  (setq st (sartd:str style))
  (cond
    ((or (sartd:v50-string-contains txt "x 1500") (sartd:v50-string-contains txt "x1500") (sartd:v50-string-contains txt "1500")) sartd:*dimstyle-k25-axle*)
    ((or (sartd:v50-string-contains txt "x 1400") (sartd:v50-string-contains txt "x1400") (sartd:v50-string-contains txt "1400")) sartd:*dimstyle-k24-axle*)
    ((sartd:v50-spmt-style-p st) st)
    (T st)))

(defun sartd:v50-clear-dim-text-override (obj / en ed newed)
  (if obj
    (progn
      (vl-catch-all-apply 'vla-put-TextOverride (list obj ""))
      (setq en (vl-catch-all-apply 'vlax-vla-object->ename (list obj)))
      (if (not (vl-catch-all-error-p en))
        (progn
          (setq ed (entget en))
          (setq newed (if (assoc 1 ed) (subst (cons 1 "") (assoc 1 ed) ed) (append ed (list (cons 1 "")))))
          (entmod newed)
          (entupd en)))
      (vl-catch-all-apply 'vla-Update (list obj))))
  obj)

(defun sartd:add-linear-dim-style (p1 p2 loc rot txt style / useStyle useTxt obj)
  ; Any SPMT axle-length dimension must use the correct SPMT dimstyle and no manual bracket text.
  (setq useStyle (sartd:v50-style-from-spmt-text style txt))
  (setq useTxt txt)
  (if (sartd:v50-spmt-style-p useStyle) (setq useTxt ""))
  (setq obj (sartd:add-linear-dim p1 p2 loc rot useTxt))
  (if obj (sartd:set-dim-style obj useStyle))
  (if (and obj (sartd:v50-spmt-style-p useStyle)) (sartd:v50-clear-dim-text-override obj))
  obj)

(defun sartd:draw-dim-h-style (x1 x2 y off txt style / yy)
  (setq yy (+ y off))
  (sartd:add-linear-dim-style (list x1 y) (list x2 y) (list (/ (+ x1 x2) 2.0) yy) 0.0 txt style))

(defun sartd:trailer-x-pitch (tr / sp)
  ; K25 axle/group X pitch is 1500mm. Other trailers use Excel/fallback.
  (setq sp (cdr (assoc 'spacing tr)))
  (cond
    ((sartd:trailer-k25-p tr) 1500.0)
    ((and sp (> (abs sp) 1.0)) sp)
    (T sartd:*k24-group-x-spacing*)))

(defun sartd:trailer-row-pitch (tr / w)
  ; K25 two-file row spacing is 1800mm in Y. K24 keeps old width/2 behaviour.
  (cond
    ((sartd:trailer-k25-p tr) 1800.0)
    (T
      (setq w (cdr (assoc 'width tr)))
      (if (and w (> (abs w) 1.0)) (/ w 2.0) sartd:*k24-group-y-spacing*))))

(defun sartd:trailer-lower-row-offset (tr)
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:draw-hydraulic-groups (data planBase / trailers hdefs tr idx hds hd ax axCount xPitch yPitch x0 y0 x y grp b br gmap sideName skippedPins planPinnedDrawn planPinnedMissing)
  ; Final K25-safe group placement.
  (setq trailers (sartd:g 'trailers data))
  (setq hdefs (sartd:g 'hydraulic-grouping data))
  (setq idx 1)
  (setq skippedPins 0)
  (setq planPinnedDrawn 0)
  (setq planPinnedMissing 0)
  (setq gmap nil)
  (foreach tr trailers
    (setq hds nil)
    (foreach hd hdefs
      (if (= (cdr (assoc 'trailer-index hd)) idx)
        (setq hds (append hds (list hd)))))
    (setq axCount (cdr (assoc 'axles tr)))
    (setq xPitch (sartd:trailer-x-pitch tr))
    (setq yPitch (sartd:trailer-row-pitch tr))
    (setq x0 (+ (car planBase) (cdr (assoc 'x tr)) (sartd:trailer-first-axle-offset tr)))
    (setq y0 (+ (cadr planBase) (cdr (assoc 'y tr)) (sartd:trailer-lower-row-offset tr)))
    (foreach hd hds
      (setq ax 1)
      (while (<= ax axCount)
        (setq x (+ x0 (* (1- ax) xPitch)))
        (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
        (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))
        (if (sartd:axle-pinned-p data idx ax)
          (progn
            (setq skippedPins (1+ skippedPins))
            (if (tblsearch "BLOCK" sartd:*block-pinned-axle-plan*)
              (progn
                (setq br (sartd:insert-block sartd:*block-pinned-axle-plan* (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_PLAN")
                    (setq planPinnedDrawn (1+ planPinnedDrawn)))))
              (setq planPinnedMissing (1+ planPinnedMissing))))
          (progn
            (setq grp (sartd:hyd-group-at-axle hd ax))
            (setq b (sartd:group-block-name grp))
            (if (and b (tblsearch "BLOCK" b))
              (progn
                (setq br (sartd:insert-block b (list x y 0.0) "SARTD-HYD-GROUP"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) (strcat "HYD_GROUP_" (itoa grp)))
                    (setq gmap (sartd:gmap-add gmap grp (list x y)))))))))
        (setq ax (1+ ax))))
    (if (sartd:trailer-k25-p tr)
      (sartd:pr (strcat "K25 hydraulic group pitch applied on trailer row " (itoa (cdr (assoc 'row tr))) ": X=1500, Y=1800.")))
    (setq idx (1+ idx)))
  (if gmap (sartd:draw-hydraulic-triangle gmap))
  (if (or gmap (> planPinnedDrawn 0))
    (progn
      (if gmap (sartd:pr "Hydraulic group squares drawn from Excel grouping table using v50 pitch logic."))
      (if (> skippedPins 0) (sartd:pr (strcat "Pinned / closed-off axle positions skipped from hydraulic groups and stability triangle: " (itoa skippedPins))))
      (if (> planPinnedDrawn 0) (sartd:pr (strcat "Top-view pinned axle blocks inserted in place of plan group squares: " (itoa planPinnedDrawn))))
      (if (> planPinnedMissing 0) (sartd:pr "TV_K24_Pinned_Axle block not found; pinned plan markers were skipped.")))
    (sartd:pr "No hydraulic group squares drawn. Check grouping rows 138 onwards and group block names.")))


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


;;; ---------------------------------------------------------------------------
;;; v0.9.9.4.3.51 patch
;;; Fix for AutoCAD profiles that do not provide FBOUNDP.
;;; v50 loaded but SARTDALL failed at stage 5 with:
;;;   error: no function definition: FBOUNDP
;;; This local polyfill is intentionally defined as FBOUNDP because older patch
;;; functions call that symbol directly.
;;; ---------------------------------------------------------------------------
(setq sartd:*version* "0.9.9.4.3.51")

(defun fboundp (sym / nm fam)
  ; AutoLISP in Harry's AutoCAD profile has no native FBOUNDP.
  ; Use the atom table as a safe function/symbol existence test for optional
  ; patch functions before calling them.
  (cond
    ((not sym) nil)
    ((= (type sym) 'SYM)
      (setq nm (strcase (vl-symbol-name sym)))
      (setq fam (atoms-family 0))
      (if (member nm fam) T nil))
    (T nil)))

(defun sartd:v51-force-border-scale-final (reason / den)
  ; Wrapper keeps the v50 hardened SCALE logic, now safe because FBOUNDP exists.
  (setq den (sartd:v50-force-border-scale-final reason))
  den)


; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


;;; ---------------------------------------------------------------------------
;;; v0.9.9.4.3.52 patch
;;; K25/K2500 deck height and deck/transport height tolerance correction.
;;;
;;; Trailer properties overview:
;;;   K2500 3000 H  -> neutral deck height 1.175m, stroke/practical tolerance +/-200mm
;;;   K2500 3000 SL -> neutral deck height 1.250m, stroke/practical tolerance +/-200mm
;;;
;;; This patch makes the K25 deck height the source used by generated geometry,
;;; trailer block Height property, the side-view deck-height dimension, and the
;;; adjacent side-view transport-height dimension. K24 keeps its existing
;;; 1250-1750mm tolerance behaviour.
;;; ---------------------------------------------------------------------------
(setq sartd:*version* "0.9.9.4.3.52")

(defun sartd:v52-first-trailer-type (data / trs tr)
  (setq trs (cdr (assoc 'trailers data)))
  (setq tr (if trs (car trs) nil))
  (if tr (sartd:str (cdr (assoc 'type tr))) ""))

(defun sartd:v52-k25-deck-profile (data / typ)
  ; Returns: (nominalDeck upperTolerance lowerTolerance label)
  ; Values are in millimetres.
  (setq typ (sartd:v52-first-trailer-type data))
  (cond
    ((sartd:model-k25-h-p typ)
      (list 1175.0 200.0 200.0 "K25 H"))
    ((sartd:model-k25-p typ)
      (list 1250.0 200.0 200.0 "K25 SL"))
    (T nil)))

(defun sartd:v52-deck-height-override (data / prof)
  (setq prof (sartd:v52-k25-deck-profile data))
  (if prof (car prof) nil))

(defun sartd:g (key data / k25Deck)
  ; v52: for K25/K2500 trailers, do not use the generic Htrailer/K24 deck height.
  ; Use the K25 neutral height from the trailer properties table:
  ;   H  = 1175mm
  ;   SL = 1250mm
  (cond
    ((and (eq key 'deck-height) (setq k25Deck (sartd:v52-deck-height-override data)))
      k25Deck)
    (T (cdr (assoc key data)))))

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp overallStart overallEnd dimObj deckX deckUpper deckLower minY maxY trWidth endLeft endRight gap topOff lower1 lower2 sideDimX sideDimX2 endTopOff transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckProf)
  ; v52 override: K25 H/SL deck height dim and adjacent transport height dim use +/-200mm tolerance.
  ; K25 H is drawn/dimensioned at 1175mm. K25 SL is drawn/dimensioned at 1250mm.
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq ppuLen 4300.0)
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq overallStart (+ (car sideBase) trX (- ppuLen)))
  (setq overallEnd (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight
    (if trailers
      (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers))
      L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: top load length, lower PPU/trailer/overall length.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (sartd:draw-dim-h-style overallStart (+ (car sideBase) trX) (cadr sideBase) lower1
                         (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*)
  (sartd:draw-dim-h-style (+ (car sideBase) trX) (+ (car sideBase) trX trLen) (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") sartd:*dimstyle-k24-axle*)
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; Side view vertical dimensions are placed beyond the end of the geometry and spaced out.
  (setq sideDimX (+ (car sideBase) (max L (+ trX trLen)) 700.0))
  (setq sideDimX2 (+ sideDimX gap))
  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list sideDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list sideDimX2 (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance.
  ; K24: existing 1250-1750mm range.
  ; K25 H/SL: fixed +/-200mm about neutral deck height.
  (setq deckX sideDimX)
  (setq deckProf (sartd:v52-k25-deck-profile data))
  (if deckProf
    (progn
      (setq deckUpper (cadr deckProf))
      (setq deckLower (caddr deckProf))
      (sartd:pr (strcat "K25 deck-height dimension profile applied: " (cadddr deckProf)
                         ", deck=" (sartd:fmt0 deck) "mm, tolerance +/-200mm.")))
    (progn
      (setq deckUpper (- sartd:*k24-deck-max* deck))
      (setq deckLower (- deck sartd:*k24-deck-min*))))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  ; Right-side height stack: load height inside, transport height outside.
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))

; Keep the clean public command set active after the v52 override.

; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]



; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.54 K24 plan-view row pitch correction
; Changes:
;   1) Plan-view axle/group/pinned marker spacing is now fixed by trailer family:
;        K25/K2500 = 1500mm X pitch x 1800mm Y row pitch
;        K24/K2400 = 1400mm X pitch x 1450mm Y row pitch
;      This pitch logic is used only for plan-view generated group/pinned marker positions.
;   2) Plan-view pinned axle/red cross blocks use the exact same X/Y coordinates as the group squares.
;      K25-specific pinned blocks are selected when present in the library; otherwise K24 blocks are used.
;   3) Side-view pinned axle blocks are placed from the current trailer deck height, so they follow K24,
;      K25 H and K25 SL deck-height logic instead of the old fixed 656mm Y position.
;   4) Cargo COG reference dimensions in plan/side/end are forced to SAR_DIM_REFERENCE-style logic.
;   5) Border layout import now handles an existing source layout name, especially Sarens source 1-1,
;      by temporarily holding the existing layout, importing the library sheet, renaming the new sheet to
;      the next free 1-# name, then restoring the original layout name.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.54")

; Final agreed plan-view pitches.
(setq sartd:*k24-group-x-spacing* 1400.0)
(setq sartd:*k24-group-y-spacing* 1450.0)
(setq sartd:*k24-group-first-axle-x-offset* 700.0)
(setq sartd:*k24-group-lower-row-y-offset* -725.0)
(setq sartd:*k25-group-x-spacing* 1500.0)
(setq sartd:*k25-group-y-spacing* 1800.0)
(setq sartd:*k25-group-first-axle-x-offset* 750.0)
(setq sartd:*k25-group-lower-row-y-offset* -900.0)

; Standardise the requested reference dimension style spelling.
; AutoCAD style lookup below is case-insensitive and still accepts old SAR_DIM_Reference drawings.
(setq sartd:*dimstyle-reference* "SAR_DIM_REFERENCE")

(setq sartd:*k25-pinned-axle-side-candidates*
  '("$0$SV_K25_Pinned_Axle" "SV_K25_Pinned_Axle"
    "$0$K25_Pinned_Axle_SIDE" "K25_Pinned_Axle_SIDE"
    "$0$K25_PINNED_AXLE_SIDE" "K25_PINNED_AXLE_SIDE"))
(setq sartd:*k25-pinned-axle-plan-candidates*
  '("$0$TV_K25_Pinned_Axle" "TV_K25_Pinned_Axle"
    "$0$K25_Pinned_Axle_TOP" "K25_Pinned_Axle_TOP"
    "$0$K25_Pinned_Axle_PLAN" "K25_Pinned_Axle_PLAN"
    "$0$K25_PINNED_AXLE_PLAN" "K25_PINNED_AXLE_PLAN"))

(defun sartd:v53-list-has-layout-p (nm lst / found n)
  (setq found nil)
  (foreach n lst
    (if (= (strcase (sartd:str n)) (strcase (sartd:str nm)))
      (setq found T)))
  found)

(defun sartd:v53-next-sheet-layout-name-from-list (names / i nm)
  (setq i 1)
  (setq nm (strcat "1-" (itoa i)))
  (while (sartd:v53-list-has-layout-p nm names)
    (setq i (1+ i))
    (setq nm (strcat "1-" (itoa i))))
  nm)

(defun sartd:v53-temp-layout-name (base / i nm)
  (setq i 1)
  (setq nm (strcat "__SARTD_HOLD_" (sartd:str base) "_" (itoa i)))
  (while (sartd:layout-name-exists-p nm (sartd:layout-names-current))
    (setq i (1+ i))
    (setq nm (strcat "__SARTD_HOLD_" (sartd:str base) "_" (itoa i))))
  nm)

(defun sartd:v53-rename-layout-safe (old new / lay res)
  (setq lay (sartd:v42-layout-object old))
  (if lay
    (progn
      (setq res (vl-catch-all-apply 'vla-put-Name (list lay new)))
      (if (vl-catch-all-error-p res)
        (progn
          (sartd:pr (strcat "Warning: could not rename layout '" old "' to '" new "': " (vl-catch-all-error-message res)))
          nil)
        T))
    nil))

(defun sartd:v53-final-layout-name-for-import (source beforeNames sourceExists / src)
  ; If the source is Sarens 1-1 and it does not exist yet, keep the first imported sheet as 1-1.
  ; Otherwise use the next free 1-# name based on the original drawing state.
  (setq src (sartd:str source))
  (cond
    ((and (not sourceExists)
          (wcmatch (strcase src) "1-*")
          (not (sartd:v53-list-has-layout-p src beforeNames)))
      src)
    (T (sartd:v53-next-sheet-layout-name-from-list beforeNames))))

(defun sartd:import-library-layout (/ path layout before0 before after added target oldcmdecho res res2 sourceExists tempName finalName renamedImported restored)
  ; v53: import the selected library layout without clashing with an existing drawing layout.
  ; Source library layouts:
  ;   Sarens = 1-1
  ;   T.EN   = 2-2
  ; Final drawing layout names:
  ;   1-1, 1-2, 1-3, ... with no name clash.
  (setq path (sartd:get-library-path))
  (if (not (and path (findfile path)))
    (progn
      (sartd:pr "No unified block library DWG found for layout import.")
      nil)
    (progn
      (setq layout (sartd:v38-select-paper-template))
      (setq before0 (sartd:layout-names-current))
      (setq sourceExists (sartd:layout-name-exists-p layout before0))
      (setq finalName (sartd:v53-final-layout-name-for-import layout before0 sourceExists))
      (setq tempName nil)
      (if sourceExists
        (progn
          (setq tempName (sartd:v53-temp-layout-name layout))
          (if (sartd:v53-rename-layout-safe layout tempName)
            (sartd:pr (strcat "Existing drawing layout '" layout "' held temporarily as '" tempName "' so the library sheet can be imported cleanly."))
            (progn
              (sartd:pr (strcat "Warning: could not hold existing layout '" layout "'. Import may reuse the existing sheet."))
              (setq tempName nil)))))

      (setq before (sartd:layout-names-current))
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (sartd:pr (strcat "Importing selected " sartd:*paper-template-label* " source layout '" layout "' from block library: " path))
      (setq res (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path layout)))
      (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))

      (setq after (sartd:layout-names-current))
      (setq added (sartd:layout-name-diff after before))
      (setq target (sartd:v40-pick-layout after added layout))

      (if (and (not target) (not (vl-catch-all-error-p res)))
        (progn
          (setq oldcmdecho (getvar "CMDECHO"))
          (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
          (sartd:pr (strcat "Exact layout import did not expose '" layout "'. Importing all layouts as fallback, then selecting " sartd:*paper-template-label* "."))
          (setq res2 (vl-catch-all-apply 'vl-cmdf (list "_.-LAYOUT" "_Template" path "*")))
          (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho))
          (setq after (sartd:layout-names-current))
          (setq added (sartd:layout-name-diff after before))
          (setq target (sartd:v40-pick-layout after added layout))))

      (cond
        (target
          (setq renamedImported nil)
          (if (/= (strcase target) (strcase finalName))
            (progn
              (if (sartd:v53-rename-layout-safe target finalName)
                (progn
                  (setq renamedImported T)
                  (sartd:pr (strcat "Imported " sartd:*paper-template-label* " layout renamed from '" target "' to '" finalName "'.")))
                (progn
                  (sartd:pr (strcat "Warning: could not rename imported layout '" target "' to '" finalName "'. Using '" target "'."))
                  (setq finalName target))))
            (progn
              (setq renamedImported T)
              (sartd:pr (strcat "Imported " sartd:*paper-template-label* " layout kept as '" finalName "'."))))

          (if tempName
            (progn
              (setq restored (sartd:v53-rename-layout-safe tempName layout))
              (if restored
                (sartd:pr (strcat "Restored existing held layout back to '" layout "'."))
                (sartd:pr (strcat "Warning: held layout '" tempName "' could not be restored to '" layout "'.")))))

          (setenv "SARTD_LAST_LAYOUT" finalName)
          (sartd:activate-paper-layout finalName)
          (sartd:pr (strcat "Using selected " sartd:*paper-template-label* " PaperSpace sheet as drawing layout: " finalName))
          finalName)
        ((vl-catch-all-error-p res)
          (if tempName (sartd:v53-rename-layout-safe tempName layout))
          (sartd:pr (strcat "Layout import command failed for selected source layout " layout ": " (vl-catch-all-error-message res)))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)
        (T
          (if tempName (sartd:v53-rename-layout-safe tempName layout))
          (sartd:pr (strcat "Layout import ran, but the selected source layout '" layout "' was not found afterwards."))
          (sartd:pr "Check the block library contains saved PaperSpace layout tabs named 1-1 and 2-2.")
          nil)))))

(defun sartd:v53-k25-trailer-p (tr)
  (and tr (sartd:trailer-k25-p tr)))

(defun sartd:v53-trailer-deck-height (tr data / typ)
  ; Per-trailer deck height. K25 H/SL values are fixed from the agreed trailer profiles.
  (setq typ (strcase (sartd:str (cdr (assoc 'type tr)))))
  (cond
    ((sartd:model-k25-h-p typ) 1175.0)
    ((sartd:trailer-k25-p tr) 1250.0)
    (T (sartd:num (cdr (assoc 'deck-height data)) (sartd:g 'deck-height data)))))

(defun sartd:trailer-x-pitch (tr / sp)
  ; v53: plan-view axle/group/pinned marker X spacing by trailer family.
  ; This deliberately ignores any odd Excel value for the plan-view generated markers.
  (cond
    ((sartd:trailer-k25-p tr) 1500.0)
    (T 1400.0)))

(defun sartd:trailer-row-pitch (tr / w)
  ; v53: plan-view axle/group/pinned marker row spacing by trailer family.
  (cond
    ((sartd:trailer-k25-p tr) 1800.0)
    (T 1450.0)))

(defun sartd:trailer-first-axle-offset (tr)
  ; First axle/bogie centre is half the pitch from the train start/reference.
  (/ (sartd:trailer-x-pitch tr) 2.0))

(defun sartd:trailer-lower-row-offset (tr)
  ; Lower row is half the agreed plan-view row-to-row pitch below the trailer centreline.
  (- (/ (sartd:trailer-row-pitch tr) 2.0)))

(defun sartd:v53-block-first-existing (names / out n)
  (setq out nil)
  (foreach n names
    (if (and (not out) (tblsearch "BLOCK" n))
      (setq out n)))
  out)

(defun sartd:v53-plan-pinned-block-name (tr / b)
  (if (sartd:trailer-k25-p tr)
    (setq b (sartd:v53-block-first-existing sartd:*k25-pinned-axle-plan-candidates*)))
  (if (not b)
    (setq b (if (tblsearch "BLOCK" sartd:*block-pinned-axle-plan*) sartd:*block-pinned-axle-plan* nil)))
  b)

(defun sartd:v53-side-pinned-block-name (tr / b)
  (if (sartd:trailer-k25-p tr)
    (setq b (sartd:v53-block-first-existing sartd:*k25-pinned-axle-side-candidates*)))
  (if (not b)
    (setq b (if (tblsearch "BLOCK" sartd:*block-pinned-axle*) sartd:*block-pinned-axle* nil)))
  b)

(defun sartd:v53-side-pinned-x-offset (tr blk)
  ; K25-specific pinned blocks should be authored with their base point on the axle/deck reference,
  ; so they do not use the old K24 calibration offset. If no K25 block exists and the K24
  ; marker is used as fallback, retain the old K24 offset.
  (if (and (sartd:trailer-k25-p tr)
           blk
           (/= (sartd:norm blk) (sartd:norm sartd:*block-pinned-axle*)))
    0.0
    sartd:*k24-pinned-marker-x-offset-from-axle*))

(defun sartd:v53-configure-pinned-block (br tr data view / deck)
  (setq deck (sartd:v53-trailer-deck-height tr data))
  ; If the future K25 pinned block has a dynamic height/deck property, drive it from the same deck value.
  (if br
    (progn
      (sartd:set-dynprop-any br '("Height" "Deck Height" "Deck_Height" "Wheel Height" "Wheel_Height" "Wheel_Hight") deck)
      (sartd:set-dynprop-any br '("Type" "Trailer Type")
        (if (sartd:model-k25-h-p (cdr (assoc 'type tr))) "H" (if (sartd:trailer-k25-p tr) "SL" "K24")))
      (vl-catch-all-apply 'vla-put-XScaleFactor (list br 1.0))
      (vl-catch-all-apply 'vla-put-YScaleFactor (list br 1.0))
      (vl-catch-all-apply 'vla-put-ZScaleFactor (list br 1.0)))))

(defun sartd:draw-side-pinned-axles (data sideBase / trailers rows row idx pins tr ax xPitch trX x y br drawn blk deck r)
  ; v53: side-view pinned axle blocks follow the live trailer deck height.
  ; K25 H uses 1175mm, K25 SL uses 1250mm, K24 uses the workbook Htrailer/deck-height.
  (setq rows (sartd:g 'pinned-axles data))
  (setq trailers (sartd:g 'trailers data))
  (setq drawn 0)
  (cond
    ((not rows) nil)
    ((not trailers) nil)
    (T
      (setq idx 1)
      (foreach tr trailers
        (setq row nil)
        (foreach r rows
          (if (= (cdr (assoc 'trailer-index r)) idx)
            (setq row r)))
        (if row
          (progn
            (setq pins (cdr (assoc 'pins row)))
            (setq trX (cdr (assoc 'x tr)))
            (setq xPitch (sartd:trailer-x-pitch tr))
            (setq deck (sartd:v53-trailer-deck-height tr data))
            (setq blk (sartd:v53-side-pinned-block-name tr))
            (if blk
              (foreach ax pins
                (if (and (> ax 0) (<= ax (cdr (assoc 'axles tr))))
                  (progn
                    ; X uses the same axle pitch/first-axle logic as the plan markers.
                    ; Y is now the trailer deck height rather than the old fixed 656mm.
                    (setq x (+ (car sideBase) trX (sartd:trailer-first-axle-offset tr) (* (1- ax) xPitch) (sartd:v53-side-pinned-x-offset tr blk)))
                    (setq y (+ (cadr sideBase) deck))
                    (setq br (sartd:insert-block blk (list x y 0.0) "0"))
                    (if br
                      (progn
                        (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_SIDE")
                        (sartd:v53-configure-pinned-block br tr data "SIDE")
                        (setq drawn (1+ drawn)))))))
              (sartd:pr "No side-view pinned axle block found; pinned side markers skipped."))))
        (setq idx (1+ idx)))
      (if (> drawn 0)
        (sartd:pr (strcat "Side-view pinned axle markers inserted/aligned to trailer deck height: " (itoa drawn) "."))))))

(defun sartd:draw-hydraulic-groups (data planBase / trailers hdefs tr idx hds hd ax axCount xPitch yPitch x0 y0 x y grp b br gmap sideName skippedPins planPinnedDrawn planPinnedMissing pblk k25msg k24msg)
  ; v53: plan-view group squares and pinned/red-cross markers share the exact same axle/bogie coordinates.
  ; K25/K2500 = 1500 X x 1800 Y. K24/K2400 = 1400 X x 1450 Y.
  (setq trailers (sartd:g 'trailers data))
  (setq hdefs (sartd:g 'hydraulic-grouping data))
  (setq idx 1)
  (setq skippedPins 0)
  (setq planPinnedDrawn 0)
  (setq planPinnedMissing 0)
  (setq gmap nil)
  (setq k25msg nil)
  (setq k24msg nil)
  (foreach tr trailers
    (setq hds nil)
    (foreach hd hdefs
      (if (= (cdr (assoc 'trailer-index hd)) idx)
        (setq hds (append hds (list hd)))))
    (setq axCount (cdr (assoc 'axles tr)))
    (setq xPitch (sartd:trailer-x-pitch tr))
    (setq yPitch (sartd:trailer-row-pitch tr))
    (setq x0 (+ (car planBase) (cdr (assoc 'x tr)) (sartd:trailer-first-axle-offset tr)))
    (setq y0 (+ (cadr planBase) (cdr (assoc 'y tr)) (sartd:trailer-lower-row-offset tr)))
    (setq pblk (sartd:v53-plan-pinned-block-name tr))
    (foreach hd hds
      (setq ax 1)
      (while (<= ax axCount)
        (setq x (+ x0 (* (1- ax) xPitch)))
        (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
        (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))
        (if (sartd:axle-pinned-p data idx ax)
          (progn
            (setq skippedPins (1+ skippedPins))
            (if pblk
              (progn
                (setq br (sartd:insert-block pblk (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_PLAN")
                    (sartd:v53-configure-pinned-block br tr data "PLAN")
                    (setq planPinnedDrawn (1+ planPinnedDrawn)))))
              (setq planPinnedMissing (1+ planPinnedMissing))))
          (progn
            (setq grp (cdr (assoc 'group hd)))
            (setq b (cdr (assoc grp sartd:*group-blocks*)))
            (if (and b (tblsearch "BLOCK" b))
              (progn
                (setq br (sartd:insert-block b (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "HYD_GROUP")
                    (setq gmap (append gmap (list (list grp x y))))))))))
        (setq ax (1+ ax))))
    (if (sartd:trailer-k25-p tr)
      (setq k25msg T)
      (setq k24msg T))
    (setq idx (1+ idx)))
  (if k25msg (sartd:pr "K25/K2500 plan-view group/pinned marker pitch applied: X=1500, Y=1800."))
  (if k24msg (sartd:pr "K24/K2400 plan-view group/pinned marker pitch applied: X=1400, Y=1450."))
  (if gmap
    (progn
      (sartd:draw-stability-triangles gmap)
      (sartd:pr "Hydraulic stability triangle drawn.")))
  (if (or gmap (> planPinnedDrawn 0))
    (progn
      (sartd:pr "Hydraulic group squares drawn from Excel grouping table using v53 pitch logic.")
      (if (> skippedPins 0) (sartd:pr (strcat "Pinned / closed-off axle positions skipped from hydraulic groups and stability triangle: " (itoa skippedPins))))
      (if (> planPinnedDrawn 0) (sartd:pr (strcat "Top-view pinned axle blocks inserted on the same bogie coordinates as the group squares: " (itoa planPinnedDrawn))))
      (if (> planPinnedMissing 0) (sartd:pr "No plan-view pinned axle block found; pinned plan markers were skipped.")))
    (sartd:pr "No hydraulic group square blocks inserted; check Excel grouping side rows and block library.")))

(defun sartd:v53-dimstyle-aliases (style / st)
  (setq st (sartd:norm (sartd:str style)))
  (cond
    ((= st (sartd:norm "SAR_DIM_REFERENCE")) '("SAR_DIM_REFERENCE" "SAR_DIM_Reference" "SAR_DIM_REF"))
    ((= st (sartd:norm "SAR_DIM_SPMT_1500")) '("SAR_DIM_SPMT_1500"))
    ((= st (sartd:norm "SAR_DIM_SPMT_1400")) '("SAR_DIM_SPMT_1400"))
    (T (list style))))

(defun sartd:v53-dimstyle-object (styles name / out st res nm)
  (setq out nil)
  (foreach st (sartd:v53-dimstyle-aliases name)
    (if (not out)
      (progn
        (setq res (vl-catch-all-apply 'vla-Item (list styles st)))
        (if (not (vl-catch-all-error-p res))
          (setq out res)))))
  (if (not out)
    (vlax-for st styles
      (if (not out)
        (progn
          (setq nm (vl-catch-all-apply 'vla-get-Name (list st)))
          (if (and (not (vl-catch-all-error-p nm))
                   (= (sartd:norm nm) (sartd:norm name)))
            (setq out st))))))
  out)

(defun sartd:set-dim-style (obj style / doc styles st nm)
  ; v53: case-insensitive/alias-safe dimstyle setter. This fixes reference dims in drawings where
  ; the style is named SAR_DIM_REFERENCE rather than SAR_DIM_Reference.
  (if (and obj style (/= (sartd:str style) ""))
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq styles (vla-get-DimStyles doc))
      (setq st (sartd:v53-dimstyle-object styles style))
      (if st
        (progn
          (setq nm (vl-catch-all-apply 'vla-get-Name (list st)))
          (if (vl-catch-all-error-p nm) (setq nm style))
          (vl-catch-all-apply 'vlax-put-property (list obj 'StyleName nm))
          (vl-catch-all-apply 'vla-Update (list obj))
          T)
        nil))
    nil))

(defun sartd:v53-force-reference-dim (obj)
  (if obj
    (progn
      (vl-catch-all-apply 'vla-put-Layer (list obj sartd:*layer-dim*))
      (sartd:set-dim-style obj sartd:*dimstyle-reference*)
      (vl-catch-all-apply 'vla-Update (list obj))))
  obj)

(defun sartd:draw-cog-origin-dims (origin cog mode / ox oy cx cy hloc vloc hobj vobj)
  ; v53: every COG-to-origin dimension, in plan/side/end, is forced to SAR_DIM_REFERENCE logic.
  ; This prevents the plan/side X-direction COG dimensions being pulled onto an SPMT axle dimstyle.
  (setq ox (car origin) oy (cadr origin) cx (car cog) cy (cadr cog))
  (setq hloc (list (/ (+ ox cx) 2.0) (- (min oy cy) (sartd:auto-dim-gap))))
  (setq vloc (list (- (min ox cx) (sartd:auto-dim-gap)) (/ (+ oy cy) 2.0)))
  (setq hobj (sartd:add-linear-dim-style (list ox oy) (list cx cy) hloc 0.0 (sartd:fmt0 (abs (- cx ox))) sartd:*dimstyle-reference*))
  (setq vobj (sartd:add-linear-dim-style (list ox oy) (list cx cy) vloc (/ pi 2.0) (sartd:fmt0 (abs (- cy oy))) sartd:*dimstyle-reference*))
  (sartd:v53-force-reference-dim hobj)
  (sartd:v53-force-reference-dim vobj))


; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.55 HOTFIX - SIDE-VIEW PINNED AXLE MARKERS USE TOP-VIEW RED CROSS FALLBACK
; -------------------------------------------------------------------------------------------------
; Fixes the v54 crash at:
;   [SARTD] Stage: side-view pinned axle markers...
;   bad association list: (1 9)
;
; Cause:
;   The pinned axle reader stores data as a simple association list like:
;     ((1 9 14) (2 9 14))
;   where the car is the trailer index and the cdr is the list of pinned axle numbers.
;   The v53/v54 side marker override incorrectly treated each row as an alist with tags
;   'trailer-index and 'pins, which caused (assoc 'trailer-index '(1 9)) to throw.
;
; User change:
;   For now there is no proper side-view pinned axle block for the K25/K2500, so the side view
;   shall use the same top-view red cross block used in plan view. The block is still placed in
;   side view at the correct axle X position and aligned to the trailer deck height.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.55")

(defun sartd:v55-side-pinned-block-name (tr / b sideb planb)
  ; Prefer a genuine K25 side marker only if it exists later.
  ; Otherwise use the top/plan red-cross marker as requested.
  (setq sideb nil)
  (setq planb nil)
  (if (sartd:trailer-k25-p tr)
    (setq sideb (sartd:v53-block-first-existing sartd:*k25-pinned-axle-side-candidates*)))
  (setq planb (sartd:v53-plan-pinned-block-name tr))
  (cond
    (sideb sideb)
    (planb planb)
    ((and sartd:*block-pinned-axle-plan* (tblsearch "BLOCK" sartd:*block-pinned-axle-plan*)) sartd:*block-pinned-axle-plan*)
    ((and sartd:*block-pinned-axle* (tblsearch "BLOCK" sartd:*block-pinned-axle*)) sartd:*block-pinned-axle*)
    (T nil)))

(defun sartd:v55-side-pinned-uses-plan-block-p (blk / n)
  (setq n (sartd:norm (sartd:str blk)))
  (or (= n (sartd:norm sartd:*block-pinned-axle-plan*))
      (= n (sartd:norm "TV_K24_Pinned_Axle"))
      (= n (sartd:norm "$0$TV_K24_Pinned_Axle"))
      (= n (sartd:norm "TV_K25_Pinned_Axle"))
      (= n (sartd:norm "$0$TV_K25_Pinned_Axle"))
      (wcmatch n "*PINNED*AXLE*TOP*")
      (wcmatch n "*PINNED*AXLE*PLAN*")))

(defun sartd:v55-side-pinned-x-offset (tr blk)
  ; Top/plan red-cross markers have their insertion point at the marker centre, so no K24 side-block
  ; calibration offset is applied when they are used in side view.
  (cond
    ((sartd:v55-side-pinned-uses-plan-block-p blk) 0.0)
    ((and (sartd:trailer-k25-p tr)
          blk
          (/= (sartd:norm blk) (sartd:norm sartd:*block-pinned-axle*))) 0.0)
    (T sartd:*k24-pinned-marker-x-offset-from-axle*)))

(defun sartd:draw-side-pinned-axles (data sideBase / trailers idx pins tr ax axCount xPitch trX x y br drawn blk deck usedPlan)
  ; v55: read pinned axles using the actual stored data structure, e.g. ((1 9) (2 9)).
  ; The marker is inserted in side view at the axle centre X coordinate and the live trailer deck height.
  ; If no true side-view marker exists, use the top-view red cross block as a temporary side marker.
  (setq trailers (sartd:g 'trailers data))
  (setq drawn 0)
  (cond
    ((not trailers) nil)
    (T
      (setq idx 1)
      (foreach tr trailers
        (setq pins (sartd:pinned-axles-for data idx))
        (if pins
          (progn
            (setq trX (cdr (assoc 'x tr)))
            (setq xPitch (sartd:trailer-x-pitch tr))
            (setq deck (sartd:v53-trailer-deck-height tr data))
            (setq axCount (cdr (assoc 'axles tr)))
            (setq blk (sartd:v55-side-pinned-block-name tr))
            (setq usedPlan (sartd:v55-side-pinned-uses-plan-block-p blk))
            (if blk
              (foreach ax pins
                (if (and (numberp ax) (> ax 0) (<= ax axCount))
                  (progn
                    (setq x (+ (car sideBase)
                               trX
                               (sartd:trailer-first-axle-offset tr)
                               (* (1- ax) xPitch)
                               (sartd:v55-side-pinned-x-offset tr blk)))
                    (setq y (+ (cadr sideBase) deck))
                    (setq br (sartd:insert-block blk (list x y 0.0) "0"))
                    (if br
                      (progn
                        (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_SIDE")
                        (sartd:v53-configure-pinned-block br tr data "SIDE")
                        (setq drawn (1+ drawn)))))))
              (sartd:pr "No side/top pinned axle marker block found; side pinned markers skipped."))))
        (setq idx (1+ idx)))
      (if (> drawn 0)
        (sartd:pr
          (strcat
            "Side-view pinned axle markers inserted at deck height using "
            "top-view red cross fallback where no side marker exists: "
            (itoa drawn)
            "."))))))


; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.56 HOTFIX - RESTORE HYDRAULIC GROUP SQUARES AND STABILITY TRIANGLE
; -------------------------------------------------------------------------------------------------
; v53/v54 introduced the correct plan-view pitch rules but one override accidentally tried to read
; a non-existent 'group field from the hydraulic side-row definition. The Excel reader stores:
;   group-before, group-after, split-after
; Therefore each axle's group must be resolved using sartd:hyd-group-at-axle.
;
; This override keeps the agreed plan-view geometry:
;   K25/K2500 = 1500mm X x 1800mm Y
;   K24/K2400 = 1400mm X x 1450mm Y
; and restores:
;   - group square block insertion
;   - pinned axle red-cross replacement at the same bogie coordinate
;   - stability triangle from the actual group centre map
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.56")

(defun sartd:draw-hydraulic-groups
  (data planBase
   / trailers hdefs tr idx hds hd ax axCount xPitch yPitch x0 y0 x y grp b br
     gmap sideName skippedPins planPinnedDrawn planPinnedMissing k25msg k24msg insertedGroups)
  (setq trailers (sartd:g 'trailers data))
  (setq hdefs (sartd:g 'hydraulic-grouping data))
  (setq idx 1)
  (setq skippedPins 0)
  (setq planPinnedDrawn 0)
  (setq planPinnedMissing 0)
  (setq insertedGroups 0)
  (setq gmap nil)
  (setq k25msg nil)
  (setq k24msg nil)

  (foreach tr trailers
    (setq hds nil)
    (foreach hd hdefs
      (if (= (cdr (assoc 'trailer-index hd)) idx)
        (setq hds (append hds (list hd)))))

    (setq axCount (cdr (assoc 'axles tr)))
    (setq xPitch (sartd:trailer-x-pitch tr))
    (setq yPitch (sartd:trailer-row-pitch tr))
    (setq x0 (+ (car planBase) (cdr (assoc 'x tr)) (sartd:trailer-first-axle-offset tr)))
    (setq y0 (+ (cadr planBase) (cdr (assoc 'y tr)) (sartd:trailer-lower-row-offset tr)))

    (foreach hd hds
      (setq ax 1)
      (while (<= ax axCount)
        (setq x (+ x0 (* (1- ax) xPitch)))
        (setq sideName (strcase (sartd:str (cdr (assoc 'side-name hd)))))
        (setq y (if (= sideName "TOP") (+ y0 yPitch) y0))

        (if (sartd:axle-pinned-p data idx ax)
          (progn
            ; Pinned/closed-off axles get the red cross marker only. They deliberately do not
            ; contribute to the hydraulic group centre map or the stability triangle.
            (setq skippedPins (1+ skippedPins))
            (setq b (sartd:v53-plan-pinned-block-name tr))
            (if (and b (tblsearch "BLOCK" b))
              (progn
                (setq br (sartd:insert-block b (list x y 0.0) "0"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_PLAN")
                    (sartd:v53-configure-pinned-block br tr data "PLAN")
                    (setq planPinnedDrawn (1+ planPinnedDrawn)))))
              (setq planPinnedMissing (1+ planPinnedMissing))))
          (progn
            ; Correct source of group number: before/after/split logic from the Excel table.
            (setq grp (sartd:hyd-group-at-axle hd ax))
            (setq b (sartd:group-block-name grp))
            (if (and grp b (tblsearch "BLOCK" b))
              (progn
                (setq br (sartd:insert-block b (list x y 0.0) "SARTD-HYD-GROUP"))
                (if br
                  (progn
                    (sartd:tag (vlax-vla-object->ename br) (strcat "HYD_GROUP_" (itoa grp)))
                    (setq gmap (sartd:gmap-add gmap grp (list x y)))
                    (setq insertedGroups (1+ insertedGroups))))))))
        (setq ax (1+ ax))))

    (if (sartd:trailer-k25-p tr)
      (setq k25msg T)
      (setq k24msg T))
    (setq idx (1+ idx)))

  (if k25msg (sartd:pr "K25/K2500 plan-view group/pinned marker pitch applied: X=1500, Y=1800."))
  (if k24msg (sartd:pr "K24/K2400 plan-view group/pinned marker pitch applied: X=1400, Y=1450."))

  (if gmap
    (sartd:draw-hydraulic-triangle gmap))

  (cond
    ((or (> insertedGroups 0) (> planPinnedDrawn 0))
      (if (> insertedGroups 0)
        (sartd:pr (strcat "Hydraulic group square blocks inserted: " (itoa insertedGroups) " using v56 group-before/after/split logic.")))
      (if (> skippedPins 0)
        (sartd:pr (strcat "Pinned / closed-off axle positions skipped from hydraulic groups and stability triangle: " (itoa skippedPins))))
      (if (> planPinnedDrawn 0)
        (sartd:pr (strcat "Top-view pinned axle red-cross blocks inserted on the same bogie coordinates as the group squares: " (itoa planPinnedDrawn))))
      (if (> planPinnedMissing 0)
        (sartd:pr "No plan-view pinned axle block found; pinned plan markers were skipped.")))
    (T
      (sartd:pr "No hydraulic group square blocks inserted; check hydraulic grouping rows, pinned axle table, and group block names."))))


; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.57 HOTFIX - SIDE-VIEW PINNED AXLE RED CROSS AT WHEEL CENTRE
; -------------------------------------------------------------------------------------------------
; User correction after v55/v56:
;   The temporary side-view pinned axle red cross must NOT sit on the trailer deck/top line.
;   It must sit at the wheel centre of the pinned axle.
;
; Agreed side-view wheel-centre heights above ground:
;   K24 / K2400 family  = 420 mm above ground
;   K25 / K2500 family  = 390 mm above ground
;
; Ground level in the side view is the sideBase Y coordinate used by SARTD.
; The X coordinate still uses the same axle index / pitch logic as before.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.57")
(setq sartd:*k24-pinned-marker-y-from-ground* 420.0)
(setq sartd:*k25-pinned-marker-y-from-ground* 390.0)

(defun sartd:v57-side-pinned-y-from-ground (tr / typ)
  (cond
    ((sartd:trailer-k25-p tr) sartd:*k25-pinned-marker-y-from-ground*)
    (T sartd:*k24-pinned-marker-y-from-ground*)))

(defun sartd:draw-side-pinned-axles (data sideBase / trailers idx pins tr ax axCount xPitch trX x y br drawn blk wheelY usedPlan)
  ; v57: use the red cross/top-view fallback as before, but place it at the wheel centreline.
  ; K24 wheel centre = ground + 420mm. K25 wheel centre = ground + 390mm.
  (setq trailers (sartd:g 'trailers data))
  (setq drawn 0)
  (cond
    ((not trailers) nil)
    (T
      (setq idx 1)
      (foreach tr trailers
        (setq pins (sartd:pinned-axles-for data idx))
        (if pins
          (progn
            (setq trX (cdr (assoc 'x tr)))
            (setq xPitch (sartd:trailer-x-pitch tr))
            (setq wheelY (sartd:v57-side-pinned-y-from-ground tr))
            (setq axCount (cdr (assoc 'axles tr)))
            (setq blk (sartd:v55-side-pinned-block-name tr))
            (setq usedPlan (sartd:v55-side-pinned-uses-plan-block-p blk))
            (if blk
              (foreach ax pins
                (if (and (numberp ax) (> ax 0) (<= ax axCount))
                  (progn
                    (setq x (+ (car sideBase)
                               trX
                               (sartd:trailer-first-axle-offset tr)
                               (* (1- ax) xPitch)
                               (sartd:v55-side-pinned-x-offset tr blk)))
                    (setq y (+ (cadr sideBase) wheelY))
                    (setq br (sartd:insert-block blk (list x y 0.0) "0"))
                    (if br
                      (progn
                        (sartd:tag (vlax-vla-object->ename br) "PINNED_AXLE_SIDE")
                        (sartd:v53-configure-pinned-block br tr data "SIDE")
                        (setq drawn (1+ drawn)))))))
              (sartd:pr "No side/top pinned axle marker block found; side pinned markers skipped."))))
        (setq idx (1+ idx)))
      (if (> drawn 0)
        (sartd:pr
          (strcat
            "Side-view pinned axle red-cross markers inserted at wheel centre: "
            "K24=420mm above ground, K25=390mm above ground. Markers inserted = "
            (itoa drawn)
            "."))))))


; [v59 cleanup removed old public command/load form]

(princ)


; =================================================================================================
; v0.9.9.4.3.58 HOTFIX - LIVE Htrailer DECK HEIGHT + DEVIATION TOLERANCES
; -------------------------------------------------------------------------------------------------
; User correction after v57:
;   Htrailer from Excel remains the actual drawn trailer/deck height for all trailer families.
;   1175 / 1250 / 1490 are not hard-coded actual heights; they are baseline/nominal values.
;   The side-view deck and adjacent transport-height dimensions must show remaining available
;   movement from the actual Htrailer value using Deviation tolerance display, not Symmetrical.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.58")

(defun sartd:g (key data)
  ; v58: restore simple data lookup. In particular, 'deck-height must remain the live Excel Htrailer value.
  (cdr (assoc key data)))

(defun sartd:v53-trailer-deck-height (tr data / live)
  ; v58: per-trailer drawn height is the live Htrailer value, not the K25 nominal baseline.
  (setq live (sartd:num (cdr (assoc 'deck-height data)) 0.0))
  (if (> live 0.0) live 0.0))

(defun sartd:v58-deck-height-limits (data / typ)
  ; Returns (minHeight maxHeight label), in millimetres.
  ; K25 H baseline 1175 with +/-200 => 975 to 1375.
  ; K25 SL baseline 1250 with +/-200 => 1050 to 1450.
  ; K24 uses the existing practical working range 1250 to 1750.
  (setq typ (sartd:v52-first-trailer-type data))
  (cond
    ((sartd:model-k25-h-p typ) (list 975.0 1375.0 "K25 H"))
    ((sartd:model-k25-p typ)   (list 1050.0 1450.0 "K25 SL"))
    (T                         (list sartd:*k24-deck-min* sartd:*k24-deck-max* "K24/K2400"))))

(defun sartd:tol-deviation-code (/ code)
  (setq code 2)
  (if (boundp 'acTolDeviation)
    (setq code (eval 'acTolDeviation)))
  code)

(defun sartd:apply-dim-tolerance (obj upper lower / u l code)
  ; v58: force Deviation tolerance display so equal values still show +200 / -200, not +/-200.
  ; Autodesk ActiveX acDimToleranceMethod values include acTolDeviation. If the enum symbol is
  ; not available in this AutoLISP session, the numeric fallback for acTolDeviation is 2.
  (if obj
    (progn
      (setq u (max 0.0 (sartd:num upper 0.0)))
      (setq l (max 0.0 (sartd:num lower 0.0)))
      (setq code (sartd:tol-deviation-code))
      ; Reset first so dimensions inherited from a symmetrical style are forced to object-level deviation.
      (vl-catch-all-apply 'vla-put-ToleranceDisplay (list obj 0))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextOverride "<>"))
      (vl-catch-all-apply 'vla-put-ToleranceUpperLimit (list obj u))
      (vl-catch-all-apply 'vla-put-ToleranceLowerLimit (list obj l))
      (vl-catch-all-apply 'vla-put-TolerancePrecision (list obj 0))
      (vl-catch-all-apply 'vla-put-ToleranceDisplay (list obj code))
      ; Repeat via generic property setter as a belt-and-braces pass.
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceUpperLimit u))
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceLowerLimit l))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TolerancePrecision 0))
      (vl-catch-all-apply 'vlax-put-property (list obj 'ToleranceDisplay code))
      (vl-catch-all-apply 'vla-Update (list obj)))))

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp overallStart overallEnd dimObj deckX deckUpper deckLower minY maxY trWidth endLeft endRight gap topOff lower1 lower2 sideDimX sideDimX2 endTopOff transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckProf deckTol deckMin deckMax deckLabel)
  ; v52 override: K25 H/SL deck height dim and adjacent transport height dim use +/-200mm tolerance.
  ; K25 H is drawn/dimensioned at 1175mm. K25 SL is drawn/dimensioned at 1250mm.
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq ppuLen 4300.0)
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq overallStart (+ (car sideBase) trX (- ppuLen)))
  (setq overallEnd (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight
    (if trailers
      (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers))
      L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: top load length, lower PPU/trailer/overall length.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (sartd:draw-dim-h-style overallStart (+ (car sideBase) trX) (cadr sideBase) lower1
                         (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*)
  (sartd:draw-dim-h-style (+ (car sideBase) trX) (+ (car sideBase) trX trLen) (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") sartd:*dimstyle-k24-axle*)
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; Side view vertical dimensions are placed beyond the end of the geometry and spaced out.
  (setq sideDimX (+ (car sideBase) (max L (+ trX trLen)) 700.0))
  (setq sideDimX2 (+ sideDimX gap))
  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list sideDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list sideDimX2 (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance.
  ; v58: deck height is ALWAYS the live Htrailer value from Excel.
  ; The tolerance values are remaining available suspension movement from that actual height.
  ; Example K25 H: min 975, max 1375, actual 1375 -> +0 / -400.
  ; K24 keeps min/max 1250/1750, so actual 1350 -> +400 / -100.
  (setq deckX sideDimX)
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr
    (strcat
      deckLabel " live Htrailer deck-height tolerance applied: actual="
      (sartd:fmt0 deck) "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
      "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  ; Right-side height stack: load height inside, transport height outside.
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))


; [v59 cleanup removed old public command/load form]

(princ)

; =================================================================================================
; v0.9.9.4.3.59 MAJOR CLEANUP / SINGLE USER COMMAND RELEASE
; User-facing command set is now intentionally reduced to one command only:
;   SARTDRUN
;
; SARTDRUN workflow:
;   1) Ask Excel source: Active / Browse / Last
;   2) Draw model from chosen Excel source at 0,0
;   3) Import selected PaperSpace sheet
;   4) Auto-space, fit viewport, jump to proper scale
;   5) Scale generated dims/blocks and update border/title from the same Excel source
;   6) Final border SCALE check from actual viewport
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.62")
(setq sartd:*v59-excel-source-label* nil)
(setq sartd:*web-workbook-path* nil)
(setq sartd:*web-transfer-code* nil)

(defun sartd:v59-kill-old-public-commands ()
  ; Best-effort command cleanup for sessions where older patch-stack versions were already loaded.
  ; In AutoLISP, assigning NIL to the c: symbol is the same strategy used in earlier releases to retire commands.
  (setq c:SARTD nil)
  (setq c:SARTDSPACE nil)
  (setq c:SARTDP nil)
  (setq c:SARTDVS nil)
  (setq c:SARTDA nil)
  (setq c:SARTDBORDER nil)
  (setq c:SARTDALL nil)
  (setq c:SARTDALL2 nil)
  (setq c:SARTDVP nil)
  (setq c:SARTDAUTOFIT nil)
  (setq c:SARTDSCALE nil)
  (setq c:SARTDVPFIT nil)
  (setq c:SARTDLIVE nil)
  (setq c:SARTDR nil)
  (setq c:SARTDDBG nil)
  (setq c:SARENS_TRAILERDRAFTSMAN nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_SPACE nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_PAPER nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_VIEWPORTSCALE nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_ANN nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_BORDER nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_AUTO nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_AUTO2 nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_AUTOFIT nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_REFRESH nil)
  (setq c:SARENS_TRAILERDRAFTSMAN_DUMPBLOCK nil)
  (princ))

(defun sartd:v59-file-exists-p (path)
  (and path (/= path "") (findfile path)))

(defun sartd:v59-active-workbook-path (/ wb p)
  (setq wb (sartd:active-workbook))
  (if wb
    (progn
      (setq p (vl-catch-all-apply 'vlax-get-property (list wb 'FullName)))
      (if (vl-catch-all-error-p p) nil p))
    nil))

(defun sartd:v59-select-excel-source (/ default opt path activePath)
  ; Returns the automatic source string used by sartd:choose-workbook: "Active" or "Last".
  ; Browse is resolved once here, then the workflow uses Last so the user is not prompted repeatedly.
  (if (and (boundp 'sartd:*web-workbook-path*)
           sartd:*web-workbook-path*
           (sartd:v59-file-exists-p sartd:*web-workbook-path*))
    (progn
      (setenv "SARTD_LAST_XLS" sartd:*web-workbook-path*)
      (setq sartd:*v59-excel-source-label*
        (strcat "Website transfer " (if sartd:*web-transfer-code* sartd:*web-transfer-code* "") ": " sartd:*web-workbook-path*))
      "Last")
    (progn
      (setq default (if (sartd:v59-file-exists-p (getenv "SARTD_LAST_XLS")) "Last" "Active"))
      (initget "Active Browse Last")
      (setq opt (getkword (strcat "\nExcel source [Active/Browse/Last] <" default ">: ")))
      (if (null opt) (setq opt default))
      (cond
    ((= opt "Active")
      (setq activePath (sartd:v59-active-workbook-path))
      (if activePath
        (progn
          (setenv "SARTD_LAST_XLS" activePath)
          (setq sartd:*v59-excel-source-label* (strcat "Active workbook: " activePath))
          "Active")
        (progn
          (sartd:pr "No active Excel workbook found. Use Browse or open the calculation workbook in Excel first.")
          nil)))
    ((= opt "Browse")
      (setq path (getfiled "Select trailer Excel calculation workbook" (getenv "SARTD_LAST_XLS") "xls;xlsx;xlsm" 0))
      (if (and path (/= path ""))
        (progn
          (setenv "SARTD_LAST_XLS" path)
          (setq sartd:*v59-excel-source-label* (strcat "Browsed workbook: " path))
          ; Use Last after browsing so each later read uses the same workbook without another Browse prompt.
          "Last")
        (progn
          (sartd:pr "Excel Browse cancelled. SARTDRUN stopped.")
          nil)))
    ((= opt "Last")
      (setq path (getenv "SARTD_LAST_XLS"))
      (if (and path (/= path ""))
        (progn
          (setq sartd:*v59-excel-source-label* (strcat "Last workbook: " path))
          "Last")
        (progn
          (sartd:pr "No last workbook stored yet. Use Browse or Active first.")
          nil)))
        (T nil)))))

(defun sartd:run-model-auto-active (/ data base sourceLabel)
  ; v59 override: keep old internal function name for compatibility, but respect the selected
  ; SARTDRUN Excel source instead of forcing Active Excel.
  (vl-load-com)
  (setq sourceLabel (if sartd:*v59-excel-source-label* sartd:*v59-excel-source-label* "selected Excel source"))
  (sartd:setup-layers)
  (sartd:go-modelspace)
  (setq data (sartd:read-data nil))
  (if data
    (progn
      (sartd:print-data-summary data)
      (setq base (list 0.0 0.0 0.0))
      (sartd:save-base base)
      (sartd:delete-generated)
      (sartd:sheet-viewport-scale)
      (setq sartd:*space-override* (sartd:modelspace))
      (sartd:draw-arrangement data base)
      (sartd:scale-generated-dims (sartd:current-view-scale))
      (sartd:scale-generated-callouts (sartd:current-view-scale))
      (setq sartd:*space-override* nil)
      (sartd:pr (strcat "Auto model draw complete at 0,0 using " sourceLabel ".")))
    (sartd:pr "Auto model draw failed: no Excel workbook/data was available."))
  (setq sartd:*space-override* nil)
  data)

(defun sartd:run-paper-auto-active (/ result)
  ; v59 override: use the selected SARTDRUN workbook source.
  (setq result (vl-catch-all-apply 'sartd:run-paper nil))
  (if (vl-catch-all-error-p result)
    (sartd:pr (strcat "PaperSpace import failed: " (vl-catch-all-error-message result))))
  result)

(defun sartd:run-border-auto-active (/ data result den)
  ; v59 override: update title/border from the selected SARTDRUN workbook source, then force SCALE
  ; from the exact final viewport as before.
  (vl-load-com)
  (sartd:pr (strcat "Starting border/title block update from selected Excel source. Final viewport scale source = " (sartd:current-border-scale-string) "."))
  (setq data (vl-catch-all-apply 'sartd:read-data (list T)))
  (cond
    ((or (vl-catch-all-error-p data) (not data))
      (if (vl-catch-all-error-p data)
        (sartd:pr (strcat "Warning: could not re-read selected Excel workbook for border update: " (vl-catch-all-error-message data)))
        (sartd:pr "Warning: no Excel data returned for border update.")))
    (T
      (setq result (vl-catch-all-apply 'sartd:update-border-attributes (list data)))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "Warning: full border/title update failed: " (vl-catch-all-error-message result))))))
  (setq den (sartd:v51-force-border-scale-final "SARTDRUN final border/title update"))
  (sartd:pr (strcat "Border/title block update complete. Border SCALE = 1:" (sartd:scale-denom->string den) "."))
  T)

(defun sartd:v59-run-workflow (/ oldauto oldcmdecho oldregen ok layoutName source)
  (vl-load-com)
  (sartd:v59-kill-old-public-commands)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDRUN major-clean workflow."))
  (setq source (sartd:v59-select-excel-source))
  (if (not source)
    (progn
      (sartd:pr "SARTDRUN stopped before drawing because no Excel source was selected.")
      nil)
    (progn
      (sartd:pr (strcat "Excel source locked for this run: " sartd:*v59-excel-source-label*))
      (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
      (setq oldcmdecho (getvar "CMDECHO"))
      (setq oldregen (getvar "REGENAUTO"))
      (sartd:setvar-safe "CMDECHO" 0)
      (sartd:setvar-safe "REGENAUTO" 0)
      (setq sartd:*auto-excel-source* source)
      (setq ok T)

      (sartd:pr "1/6 Draw model from selected Excel source at 0,0.")
      (setq ok (sartd:safe-stage "1/6 ModelSpace draw" 'sartd:run-model-auto-active))

      (if ok
        (progn
          (sartd:pr "2/6 Import selected PaperSpace sheet from block library.")
          (setq ok (sartd:safe-stage "2/6 PaperSpace sheet import" 'sartd:run-paper-auto-active))))

      (if ok
        (progn
          (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:pr "3/6 Auto-space views, run viewport ZOOM All, then apply nearest safe existing viewport scale.")
          (setq ok (sartd:safe-stage "3/6 Auto-space and viewport scale" 'sartd:run-autofit))))

      (if ok
        (progn
          (sartd:pr "4/6 Confirm final viewport scale for dims/blocks/border.")
          (setq ok (sartd:safe-stage "4/6 Final viewport scale diagnostics" 'sartd:post-autofit-diagnostics))))

      (if ok
        (progn
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:pr "5/6 Update selected border/title block attributes.")
          (setq ok (sartd:safe-stage "5/6 Border/title block update" 'sartd:run-border-auto-active))))

      (if ok
        (progn
          (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace '())
          (vl-catch-all-apply 'sartd:go-paperspace '())
          (vl-catch-all-apply 'vla-Regen (list (vla-get-ActiveDocument (vlax-get-acad-object)) 1))
          (sartd:pr "6/6 PaperSpace restored and drawing regenerated.")
          (sartd:v51-force-border-scale-final "SARTDRUN final end-check")))

      (if oldregen (sartd:setvar-safe "REGENAUTO" oldregen) (sartd:setvar-safe "REGENAUTO" 1))
      (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
      (setq sartd:*auto-excel-source* oldauto)
      (if ok
        (sartd:pr "SARTDRUN complete.")
        (sartd:pr "SARTDRUN stopped before completion. Check the last numbered stage above."))
      ok)))


; =================================================================================================
; v0.9.9.4.3.60 SIDE-VIEW HEIGHT DIMENSION CLEANUP
; - Side-view height stack now splits: Load Height, Packing, Deck Height, Transport Height.
; - Deck and Transport keep live Htrailer deviation tolerance logic from v58.
; - Vertical height dimensions are pushed beyond the rightmost visible side-view equipment, including a right PPU,
;   so right-hand PPU blocks do not clash with the side height dimensions.
; =================================================================================================

(defun sartd:v60-side-right-visible-x (data sideBase L / trailers maxRel)
  (setq trailers (sartd:g 'trailers data))
  (setq maxRel L)
  (if trailers
    (setq maxRel (max maxRel (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)))))
  (+ (car sideBase) maxRel))

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp overallStart overallEnd dimObj deckX deckUpper deckLower minY maxY trWidth endLeft endRight gap topOff lower1 lower2 sideRight sideDimX loadDimX packDimX deckDimX transportDimX endTopOff transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckProf deckTol deckMin deckMax deckLabel packDimObj)
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq ppuLen 4300.0)
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq overallStart (+ (car sideBase) trX (- ppuLen)))
  (setq overallEnd (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight
    (if trailers
      (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers))
      L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: top load length, lower PPU/trailer/overall length.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (sartd:draw-dim-h-style overallStart (+ (car sideBase) trX) (cadr sideBase) lower1
                         (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*)
  (sartd:draw-dim-h-style (+ (car sideBase) trX) (+ (car sideBase) trX trLen) (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") sartd:*dimstyle-k24-axle*)
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; v60 side-view height stack.
  ; Position dimensions clear of the rightmost visible trailer equipment, including a right-hand PPU.
  ; The vertical dimension content is split as:
  ;   1) Load Height only
  ;   2) Packing only
  ;   3) Trailer deck/Htrailer with remaining-movement tolerance
  ;   4) Overall Transport Height with the same remaining-movement tolerance
  (setq sideRight (sartd:v60-side-right-visible-x data sideBase L))
  (setq loadDimX (+ sideRight 700.0))
  (setq packDimX (+ loadDimX (* 0.65 gap)))
  (setq deckDimX (+ packDimX (* 0.65 gap)))
  (setq transportDimX (+ deckDimX (* 0.85 gap)))

  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list loadDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)

  (if (> (abs pack) 0.5)
    (setq packDimObj
      (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                  (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                                  (list packDimX (+ (cadr sideBase) deck (/ pack 2.0)))
                                  (/ pi 2.0) (strcat "Packing = " (sartd:fmt0 pack)) sartd:*dimstyle-standard*)))

  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list transportDimX (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance.
  ; Htrailer remains the live actual height from Excel.
  ; Tolerances are remaining available movement from actual height, displayed as Deviation.
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr
    (strcat
      "v60 " deckLabel " live Htrailer deck-height tolerance applied: actual="
      (sartd:fmt0 deck) "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
      "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckDimX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)
  (sartd:pr "v60 side-view height dimensions split into Load Height, Packing, Htrailer deck height, and Transport Height; stack placed clear of right PPU.")

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  ; Right-side height stack: load height inside, transport height outside.
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))

(sartd:v59-kill-old-public-commands)

(defun c:SARTDRUN ()
  (sartd:v50-clear-scale-cache)
  (sartd:v59-run-workflow)
  (princ))



; =================================================================================================
; v0.9.9.4.3.61 SIDE-VIEW HEIGHT DIMENSION LAYOUT REFINEMENT
; - Keeps v60/v58 calculation logic.
; - Packing height remains a real dimension, but its text is moved using AutoCAD dimension text movement
;   with leader behaviour, matching the intended manual layout.
; - Right-hand height stack is spaced so right PPU blocks do not clash with Load/Packing/Deck/Transport dims.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.62")

(defun sartd:v61-move-dim-text-with-leader (obj pt / res)
  ; Move dimension text to pt and request AutoCAD's "move text, add leader" behaviour where available.
  ; Different AutoCAD versions expose these properties slightly differently, so each call is guarded.
  (if obj
    (progn
      (vl-catch-all-apply 'vla-put-TextMovement (list obj 1))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextMovement 1))
      (vl-catch-all-apply 'vla-put-TextPosition (list obj (sartd:pt (car pt) (cadr pt) 0.0)))
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextPosition (sartd:pt (car pt) (cadr pt) 0.0)))
      ; Keep the dimension line in place and let AutoCAD draw the leader from the moved text.
      (vl-catch-all-apply 'vlax-put-property (list obj 'Fit 3))
      (vl-catch-all-apply 'vla-Update (list obj))
      obj)))

(defun sartd:v61-add-packing-dim-with-leader (p1 p2 dimPt textPt txt / obj)
  (setq obj (sartd:add-linear-dim-style p1 p2 dimPt (/ pi 2.0) txt sartd:*dimstyle-standard*))
  (sartd:v61-move-dim-text-with-leader obj textPt)
  obj)

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp overallStart overallEnd dimObj deckX deckUpper deckLower minY maxY trWidth endLeft endRight gap topOff lower1 lower2 sideRight loadDimX packDimX packTextX packTextY deckDimX transportDimX endTopOff transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckProf deckTol deckMin deckMax deckLabel packDimObj)
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq ppuLen 4300.0)
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq overallStart (+ (car sideBase) trX (- ppuLen)))
  (setq overallEnd (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight
    (if trailers
      (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers))
      L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: top load length, lower PPU/trailer/overall length.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (sartd:draw-dim-h-style overallStart (+ (car sideBase) trX) (cadr sideBase) lower1
                         (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*)
  (sartd:draw-dim-h-style (+ (car sideBase) trX) (+ (car sideBase) trX trLen) (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") sartd:*dimstyle-k24-axle*)
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; v61 side-view height stack.
  ; Clear of right PPU and visually ordered like the marked-up reference:
  ;   inner:   Load Height only
  ;   leader:  Packing only, real dim with moved text and leader
  ;   outer:   Htrailer/deck height with deviation tolerance
  ;   furthest: Transport Height with the same deviation tolerance
  (setq sideRight (sartd:v60-side-right-visible-x data sideBase L))
  (setq loadDimX (+ sideRight 700.0))
  (setq packDimX (+ sideRight 980.0))
  (setq deckDimX (+ sideRight 1550.0))
  (setq transportDimX (+ sideRight 2350.0))
  (setq packTextX (+ sideRight 1325.0))
  ; Put packing text away from the tiny 400mm dimension and away from the Load Height text.
  (setq packTextY (+ (cadr sideBase) loadBot (* 0.45 H)))

  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list loadDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)

  (if (> (abs pack) 0.5)
    (setq packDimObj
      (sartd:v61-add-packing-dim-with-leader
        (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
        (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
        (list packDimX (+ (cadr sideBase) deck (/ pack 2.0)))
        (list packTextX packTextY)
        (strcat "Packing = " (sartd:fmt0 pack)))))

  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list transportDimX (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance.
  ; Htrailer remains the live actual height from Excel.
  ; Tolerances are remaining available movement from actual height, displayed as Deviation.
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr
    (strcat
      "v61 " deckLabel " live Htrailer deck-height tolerance applied: actual="
      (sartd:fmt0 deck) "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
      "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckDimX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)
  (sartd:pr "v61 side-view height dimensions laid out with Packing moved using dimension text/leader behaviour, clear of right PPU.")

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  ; Right-side height stack: load height inside, transport height outside.
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))



; =================================================================================================
; v0.9.9.4.3.62 EXTENTS / PPU / DRAW-ORDER CLEANUP
; - K25 / K2500 PPU length corrected to 4575mm. K24 remains 4300mm.
; - Side-view transport length and ground line use true visible extents, including left/right PPUs.
; - Side-view height dimension columns are spaced from the actual rightmost equipment extent.
; - Plan-view COG labels are moved to a safe label zone and connected by leaders.
; - Trailer blocks are sent to the back of the draw order and dimensions are brought to the front.
; =================================================================================================

(defun sartd:trailer-ppu-length (tr / typ)
  (if (and tr (sartd:trailer-k25-p tr)) 4575.0 4300.0))

(defun sartd:plan-left-ref-x-for-trailer (tr planBase / x ppu ppuLen)
  (setq x (cdr (assoc 'x tr)))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen (sartd:trailer-ppu-length tr))
  (cond
    ((or (= ppu "LEFT") (= ppu "BOTH")) (+ (car planBase) (- x ppuLen)))
    (T (+ (car planBase) x))))

(defun sartd:trailer-ppu-left-edge (tr / x ppu ppuLen)
  (setq x (sartd:num (cdr (assoc 'x tr)) 0.0))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen (sartd:trailer-ppu-length tr))
  (cond
    ((or (= ppu "LEFT") (= ppu "BOTH")) (- x ppuLen))
    (T x)))

(defun sartd:trailer-ppu-right-edge (tr / x len ppu ppuLen)
  (setq x (sartd:num (cdr (assoc 'x tr)) 0.0))
  (setq len (sartd:num (cdr (assoc 'length tr)) 0.0))
  (setq ppu (strcase (sartd:str (cdr (assoc 'ppu-state tr)))))
  (setq ppuLen (sartd:trailer-ppu-length tr))
  (cond
    ((or (= ppu "RIGHT") (= ppu "BOTH")) (+ x len ppuLen))
    (T (+ x len))))

(defun sartd:v62-dimstyle-axle (tr)
  (if (and tr (sartd:trailer-k25-p tr) (boundp 'sartd:*dimstyle-k25-axle*))
    sartd:*dimstyle-k25-axle*
    sartd:*dimstyle-k24-axle*))

(defun sartd:v62-side-right-visible-x (data sideBase L / trailers maxRel)
  (setq trailers (sartd:g 'trailers data))
  (setq maxRel L)
  (if trailers
    (setq maxRel (max maxRel (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)))))
  (+ (car sideBase) maxRel))

(defun sartd:v62-cog-text (label weight)
  (cond
    ((= (sartd:norm label) "CARGOCOG")
      (strcat "Cargo C.o.G = " (rtos (sartd:num weight 0.0) 2 1) " Te"))
    ((= (sartd:norm label) "COMBINEDCOG")
      (strcat "Combined C.o.G = " (rtos (sartd:num weight 0.0) 2 1) " Te"))
    (T (strcat label " = " (rtos (sartd:num weight 0.0) 2 1) " Te"))))

(defun sartd:v62-draw-cog-symbol-only (x y / br r)
  (if (tblsearch "BLOCK" sartd:*block-cog*)
    (progn
      (setq br (sartd:insert-block sartd:*block-cog* (list x y 0.0) sartd:*layer-cog*))
      (if br
        (progn
          (sartd:tag (vlax-vla-object->ename br) "COG")
          (sartd:putprop-safe br 'XScaleFactor 1.0)
          (sartd:putprop-safe br 'YScaleFactor 1.0)
          (sartd:putprop-safe br 'ZScaleFactor 1.0)
          (sartd:set-dynprop-any br '("Scale" "Drawing Scale" "Drawing_Scale") (sartd:ground-scale-string))
          ; Keep the symbol true-positioned. Labels are now separate text objects in a safe zone.
          (sartd:set-single-attribute br "ITEM" "")))
      br)
    (progn
      (setq r 150.0)
      (sartd:add-circle (list x y) r sartd:*layer-cog*)
      (sartd:add-line (list (- x (* 1.5 r)) y) (list (+ x (* 1.5 r)) y) sartd:*layer-cog*)
      (sartd:add-line (list x (- y (* 1.5 r))) (list x (+ y (* 1.5 r))) sartd:*layer-cog*))))

(defun sartd:v62-add-cog-label (txt fromPt textPt / tObj lObj)
  (setq lObj (sartd:add-line fromPt textPt sartd:*layer-cog*))
  (if lObj (sartd:tag (vlax-vla-object->ename lObj) "COG_LABEL"))
  (setq tObj (sartd:add-text txt textPt 220.0 sartd:*layer-cog*))
  (if tObj
    (progn
      (sartd:tag (vlax-vla-object->ename tObj) "TEXT")
      (vl-catch-all-apply 'vla-put-Color (list tObj 1))))
  tObj)

(defun sartd:v62-draw-plan-cogs (data planBase / L W trailers maxRight gap cx cy ccx ccy cargoWt combWt labelX midY sep cargoPt combPt cargoLabelPt combLabelPt)
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq trailers (sartd:g 'trailers data))
  (setq maxRight L)
  (if trailers (setq maxRight (max maxRight (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)))))
  (setq gap (sartd:auto-dim-gap))
  (setq cx (sartd:g 'cargo-cog-x data))
  (setq cy (sartd:g 'cargo-cog-y data))
  (setq ccx (sartd:g 'combined-cog-x data))
  (setq ccy (sartd:g 'combined-cog-y data))
  (setq cargoWt (sartd:g 'cargo-weight data))
  (setq combWt (sartd:g 'combined-weight data))
  (setq cargoPt (list (+ (car planBase) cx) (+ (cadr planBase) cy)))
  (setq combPt  (list (+ (car planBase) ccx) (+ (cadr planBase) ccy)))
  (sartd:v62-draw-cog-symbol-only (car cargoPt) (cadr cargoPt))
  (sartd:v62-draw-cog-symbol-only (car combPt) (cadr combPt))
  ; Safe label zone: outside the right-hand equipment/load extents, vertically stacked with a scale-aware gap.
  (setq labelX (+ (car planBase) maxRight (max 1200.0 (* 1.35 gap))))
  (setq midY (+ (cadr planBase) (/ W 2.0)))
  (setq sep (max 650.0 (* 0.9 gap)))
  (setq cargoLabelPt (list labelX (+ midY (/ sep 2.0))))
  (setq combLabelPt  (list labelX (- midY (/ sep 2.0))))
  (sartd:v62-add-cog-label (sartd:v62-cog-text "CARGO COG" cargoWt) cargoPt cargoLabelPt)
  (sartd:v62-add-cog-label (sartd:v62-cog-text "COMBINED COG" combWt) combPt combLabelPt)
  (sartd:pr "v62 plan-view COG labels placed in a clear right-hand label zone with leaders."))

(defun sartd:v62-ss-by-roles (roles / ss all i ent role out rlist)
  (setq out (ssadd))
  (setq rlist (mapcar 'strcase roles))
  (setq all (ssget "_X" '((410 . "Model"))))
  (if all
    (progn
      (setq i 0)
      (while (< i (sslength all))
        (setq ent (ssname all i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (if (member role rlist) (ssadd ent out))
        (setq i (1+ i)))))
  (if (> (sslength out) 0) out nil))

(defun sartd:v62-draworder (ss mode / r)
  (if ss
    (progn
      (setq r (vl-catch-all-apply 'vl-cmdf (list "_.DRAWORDER" ss "" mode)))
      (not (vl-catch-all-error-p r)))
    nil))

(defun sartd:v62-apply-draw-order (/ ssTrailer ssText ssDims)
  ; Trailer blocks must sit behind all generated geometry. Dimensions must finish above everything.
  (setq ssTrailer (sartd:v62-ss-by-roles '("TRAILER_BLOCK")))
  (if ssTrailer (sartd:v62-draworder ssTrailer "_Back"))
  ; Bring non-dimensional callouts/COG labels forward first, then dimensions last.
  (setq ssText (sartd:v62-ss-by-roles '("TEXT" "VIEW_LABEL" "COG" "COG_LABEL" "PINNED_AXLE" "PINNED_AXLE_PLAN" "PINNED_AXLE_SIDE")))
  (if ssText (sartd:v62-draworder ssText "_Front"))
  (setq ssDims (sartd:v62-ss-by-roles '("DIM")))
  (if ssDims (sartd:v62-draworder ssDims "_Front"))
  (sartd:pr "v62 draw order applied: trailer blocks to back; dimensions brought to front.")
  T)

(defun sartd:draw-trailer-blocks-split (tr view base deck / segs seg segtr xoff x y br v total maxAx msg parts)
  ; v62: same split logic, but trailer assembly blocks are tagged separately so they can be sent behind all geometry.
  (setq v (strcase (sartd:str view)))
  (setq segs (sartd:v46-trailer-segments tr))
  (setq total (sartd:int (cdr (assoc 'axles tr)) 0))
  (setq maxAx (sartd:v46-trailer-block-max-axles tr))
  (if (and (= v "TOP") (> total maxAx))
    (progn
      (setq parts "")
      (foreach seg segs
        (setq parts (strcat parts (if (= parts "") "" " + ") (itoa (cdr (assoc 'axles seg))))))
      (sartd:pr (strcat "Trailer row " (itoa (cdr (assoc 'row tr))) " has " (itoa total)
                         " axle lines; visual dynamic blocks split as " parts " axles."))))
  (foreach seg segs
    (setq segtr (cdr (assoc 'trailer seg)))
    (setq xoff (sartd:num (cdr (assoc 'xoff seg)) 0.0))
    (cond
      ((= v "TOP")
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (+ (cadr base) (sartd:num (cdr (assoc 'y tr)) 0.0))))
      ((= v "SIDE")
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (+ (cadr base) deck)))
      (T
        (setq x (+ (car base) (sartd:num (cdr (assoc 'x tr)) 0.0) xoff))
        (setq y (cadr base))))
    (setq br (sartd:insert-block (sartd:trailer-block-name segtr v) (list x y 0.0) "0"))
    (if br
      (progn
        (sartd:configure-trailer-block br segtr v deck)
        (sartd:tag (vlax-vla-object->ename br) "TRAILER_BLOCK"))))
  T)

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp ppu overallStart overallEnd dimObj deckUpper deckLower minY maxY trWidth gap topOff lower1 lower2 sideRight loadDimX packDimX packTextX packTextY deckDimX transportDimX transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckTol deckMin deckMax deckLabel packDimObj axleStyle leftEdge rightEdge leftPpuEnd rightPpuStart)
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq ppu (if firstTr (strcase (sartd:str (cdr (assoc 'ppu-state firstTr)))) "NONE"))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq axleStyle (sartd:v62-dimstyle-axle firstTr))
  (setq leftEdge (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0))
  (setq rightEdge (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen))
  (setq overallStart (+ (car sideBase) leftEdge))
  (setq overallEnd (+ (car sideBase) rightEdge))
  (setq leftPpuEnd (+ (car sideBase) trX))
  (setq rightPpuStart (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:draw-dim-v-between planWidthRefX planWidthDimX (cadr planBase) (+ (cadr planBase) W)
                            (strcat "Transport Width = " (sartd:fmt0 W)))
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: use real equipment extents, including left/right PPUs.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (if (or (= ppu "LEFT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style overallStart leftPpuEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h-style leftPpuEnd rightPpuStart (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") axleStyle)
  (if (or (= ppu "RIGHT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style rightPpuStart overallEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; v62 side-view height stack: scale-aware columns from the actual rightmost equipment extent.
  (setq sideRight (sartd:v62-side-right-visible-x data sideBase L))
  (setq loadDimX (+ sideRight (* 1.20 gap)))
  (setq packDimX (+ sideRight (* 2.35 gap)))
  (setq deckDimX (+ sideRight (* 3.70 gap)))
  (setq transportDimX (+ sideRight (* 5.05 gap)))
  (setq packTextX (+ sideRight (* 2.90 gap)))
  (setq packTextY (+ (cadr sideBase) loadBot (* 0.38 H)))

  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list loadDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)

  (if (> (abs pack) 0.5)
    (setq packDimObj
      (sartd:v61-add-packing-dim-with-leader
        (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
        (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
        (list packDimX (+ (cadr sideBase) deck (/ pack 2.0)))
        (list packTextX packTextY)
        (strcat "Packing = " (sartd:fmt0 pack)))))

  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list transportDimX (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance from live Htrailer.
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr (strcat "v62 " deckLabel " live Htrailer tolerance: actual=" (sartd:fmt0 deck)
                    "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
                    "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckDimX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)
  (sartd:pr "v62 side-view dimensions use real PPU extents and wide, scale-aware height columns.")

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))



; =================================================================================================
; v0.9.9.4.3.63 PLAN VIEW COG LABEL REFINEMENT
; - Reverts the v62 right-hand shared COG label zone for plan view.
; - Cargo C.o.G keeps the original COG block/attribute label position.
; - Combined C.o.G keeps its true symbol position, but its text is placed just below its own COG icon.
; - Removes the long red label-zone leader lines from the plan view.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.63")

(defun sartd:v63-add-combined-cog-text-below (txt cogPt / gap h textPt tObj)
  (setq gap (max 450.0 (* 0.42 (sartd:auto-dim-gap))))
  (setq h 220.0)
  ; Text starts just below and slightly to the right of the combined COG symbol.
  ; This keeps it visually tied to its own icon without pushing both labels to a far label zone.
  (setq textPt (list (+ (car cogPt) 350.0) (- (cadr cogPt) gap)))
  (setq tObj (sartd:add-text txt textPt h sartd:*layer-cog*))
  (if tObj
    (progn
      (sartd:tag (vlax-vla-object->ename tObj) "TEXT")
      (sartd:tag (vlax-vla-object->ename tObj) "COG_LABEL")
      (vl-catch-all-apply 'vla-put-Color (list tObj 1))))
  tObj)

(defun sartd:v62-draw-plan-cogs (data planBase / cx cy ccx ccy cargoWt combWt cargoPt combPt)
  ; v63 override of the v62 function:
  ; Cargo COG uses the original block label position.
  ; Combined COG uses a symbol-only block, then separate text below the symbol.
  (setq cx (sartd:g 'cargo-cog-x data))
  (setq cy (sartd:g 'cargo-cog-y data))
  (setq ccx (sartd:g 'combined-cog-x data))
  (setq ccy (sartd:g 'combined-cog-y data))
  (setq cargoWt (sartd:g 'cargo-weight data))
  (setq combWt (sartd:g 'combined-weight data))
  (setq cargoPt (list (+ (car planBase) cx) (+ (cadr planBase) cy)))
  (setq combPt  (list (+ (car planBase) ccx) (+ (cadr planBase) ccy)))
  ; Original location/behaviour for the Cargo COG label.
  (sartd:draw-cog (car cargoPt) (cadr cargoPt) "CARGO COG" cargoWt)
  ; Combined symbol remains true-positioned, with the label moved just below it.
  (sartd:v62-draw-cog-symbol-only (car combPt) (cadr combPt))
  (sartd:v63-add-combined-cog-text-below (sartd:v62-cog-text "COMBINED COG" combWt) combPt)
  (sartd:pr "v63 plan-view COG labels: Cargo label kept original; Combined label placed below its COG icon."))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v63 keeps Cargo COG label original and places Combined COG label below its icon; keeps v62 PPU/dim/draw-order fixes."))
(princ)


; =================================================================================================
; v0.9.9.4.3.64 PLAN COG TEXT SCALE + HARD DRAW-ORDER FIX
; - Combined C.o.G plan label keeps the v63 location below its own COG icon, but now scales like all other
;   generated callout text instead of staying too small.
; - COG_LABEL role is now treated as generated text during SARTDVS scaling.
; - Draw order is hardened: trailer assemblies go to the back, all ModelSpace dimensions go to the front last.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.64")

(defun sartd:v64-cog-label-height (/ den)
  ; Match the generated text scaling rule used by SARTDVS: text height = 2 x viewport denominator.
  ; Falls back safely before the final viewport scale is known.
  (setq den (sartd:scale-int (sartd:current-view-scale)))
  (max 350.0 (* 2.0 (float den))))

(defun sartd:v63-add-combined-cog-text-below (txt cogPt / gap h textPt tObj)
  ; v64 override of the v63 helper.
  ; Same position logic as v63, but the text height is scale-aware from creation and is also picked up
  ; by sartd:scale-generated-callouts through the COG_LABEL role.
  (setq gap (max 450.0 (* 0.42 (sartd:auto-dim-gap))))
  (setq h (sartd:v64-cog-label-height))
  (setq textPt (list (+ (car cogPt) 350.0) (- (cadr cogPt) gap)))
  (setq tObj (sartd:add-text txt textPt h sartd:*layer-cog*))
  (if tObj
    (progn
      ; Keep TEXT first so older XDATA readers still see it as scalable text.
      (sartd:tag (vlax-vla-object->ename tObj) "TEXT")
      (sartd:tag (vlax-vla-object->ename tObj) "COG_LABEL")
      (vl-catch-all-apply 'vla-put-Color (list tObj 1))
      (vl-catch-all-apply 'vla-Update (list tObj))))
  tObj)

(defun sartd:scale-generated-callouts (scale / ss i ent obj role hText hView den)
  ; v64 override of the v43/v62 scaling function.
  ; Dims/text use viewport denominator. COG/Ground blocks use their dynamic Custom > Scale dropdown.
  ; COG_LABEL is explicitly included so the v63 Combined C.o.G plan label does not stay too small.
  (setq den (sartd:scale-int scale))
  (setq hText (* 2.0 (float den)))
  (setq hView (* 2.0 (float den)))
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(-3 ("SARENS_TRAILERDRAFTSMAN"))))))
  (if (vl-catch-all-error-p ss) (setq ss nil))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq obj (vlax-ename->vla-object ent))
        (cond
          ((= role "COG")
            (sartd:v43-scale-cog-ground obj den))
          ((= role "GROUND_BLOCK")
            (sartd:v43-scale-cog-ground obj den))
          ((= role "COORDINATE")
            (sartd:putprop-safe obj 'XScaleFactor (float den))
            (sartd:putprop-safe obj 'YScaleFactor (float den))
            (sartd:putprop-safe obj 'ZScaleFactor (float den))
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((or (= role "PINNED_AXLE") (= role "PINNED_AXLE_PLAN") (= role "PINNED_AXLE_SIDE"))
            ; Pinned axle cross geometry is real-size marker geometry and must not be drawing-scale enlarged.
            (sartd:putprop-safe obj 'XScaleFactor 1.0)
            (sartd:putprop-safe obj 'YScaleFactor 1.0)
            (sartd:putprop-safe obj 'ZScaleFactor 1.0)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((= role "VIEW_LABEL")
            (sartd:putprop-safe obj 'Height hView)
            (vl-catch-all-apply 'vla-Update (list obj)))
          ((or (= role "TEXT") (= role "COG_LABEL"))
            (sartd:putprop-safe obj 'Height hText)
            (vl-catch-all-apply 'vla-Update (list obj))))
        (setq i (1+ i)))))
  (sartd:pr (strcat "SARTDVS scaling applied. Dims/text/COG labels set to viewport 1:"
                    (sartd:scale-denom->string den)
                    "; COG/Ground driven by their Custom > Scale dropdown where available.")))

(defun sartd:v64-ss-model-dimensions (/ ss)
  ; All dimensions in ModelSpace should sit above generated geometry. This intentionally catches generated
  ; reference dimensions even if their XDATA role was not read correctly.
  (setq ss (vl-catch-all-apply 'ssget (list "_X" (list '(0 . "DIMENSION") '(410 . "Model")))))
  (if (vl-catch-all-error-p ss) nil ss))

(defun sartd:v64-ss-model-inserts-by-role (roles / ss all i ent role out rlist)
  (setq out (ssadd))
  (setq rlist (mapcar 'strcase roles))
  (setq all (ssget "_X" '((410 . "Model") (0 . "INSERT"))))
  (if all
    (progn
      (setq i 0)
      (while (< i (sslength all))
        (setq ent (ssname all i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (if (member role rlist) (ssadd ent out))
        (setq i (1+ i)))))
  (if (> (sslength out) 0) out nil))

(defun sartd:v64-ss-generated-front-objects (/ ss all i ent role typ out frontRoles)
  ; Non-dimension generated callouts above trailer blocks, then all dimensions are brought above these.
  (setq out (ssadd))
  (setq frontRoles '("TEXT" "VIEW_LABEL" "COG" "COG_LABEL" "PINNED_AXLE" "PINNED_AXLE_PLAN" "PINNED_AXLE_SIDE" "COORDINATE"))
  (setq all (ssget "_X" '((410 . "Model"))))
  (if all
    (progn
      (setq i 0)
      (while (< i (sslength all))
        (setq ent (ssname all i))
        (setq role (strcase (sartd:str (sartd:xdata-role ent))))
        (setq typ (cdr (assoc 0 (entget ent))))
        (if (and (/= typ "DIMENSION") (member role frontRoles)) (ssadd ent out))
        (setq i (1+ i)))))
  (if (> (sslength out) 0) out nil))

(defun sartd:v64-apply-draw-order (/ ssTrailer ssFront ssDims)
  ; Definitive generated draw order:
  ;   1) trailer block assemblies to the back
  ;   2) COGs/text/pinned markers forward
  ;   3) all dimensions to the very front last
  (setq ssTrailer (sartd:v64-ss-model-inserts-by-role '("TRAILER_BLOCK")))
  (if ssTrailer (sartd:v62-draworder ssTrailer "_Back"))
  (setq ssFront (sartd:v64-ss-generated-front-objects))
  (if ssFront (sartd:v62-draworder ssFront "_Front"))
  (setq ssDims (sartd:v64-ss-model-dimensions))
  (if ssDims (sartd:v62-draworder ssDims "_Front"))
  (sartd:pr "v64 draw order applied: trailer blocks sent to back; all ModelSpace dimensions brought to front last.")
  T)

(defun sartd:v62-apply-draw-order ()
  ; Override the v62 hook so every model redraw gets the hardened v64 draw order.
  (sartd:v64-apply-draw-order))

(defun c:SARTDRUN ()
  ; Main public command remains SARTDRUN only. Run workflow, then repeat draw-order once more at the end
  ; because viewport/dynamic block updates can visually disturb draw order.
  (sartd:v50-clear-scale-cache)
  (sartd:v59-run-workflow)
  (sartd:v64-apply-draw-order)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v64 fixes Combined COG plan text scale and hard-forces all ModelSpace dimensions above generated geometry."))
(princ)



; =================================================================================================
; v0.9.9.4.3.65 PLAN WIDTH DIM + SAFE DRAW-ORDER FIX
; - Plan-view right-hand width dimension is forced to SAR_DIM with TextOverride "Transport Width = <>".
; - DRAWORDER is now run from the Model tab so ModelSpace selections are in the current space.
; - Draw-order options use B/F keywords rather than _Back/_Front being fed after a cancelled command.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.65")

(defun sartd:v65-force-standard-transport-width-dim (obj /)
  ; The plan-view right-side dimension must never inherit the SPMT axle dimstyle/suffix.
  ; Force SAR_DIM and a live measurement override.
  (if obj
    (progn
      (sartd:set-dim-style obj sartd:*dimstyle-standard*)
      (vl-catch-all-apply 'vlax-put-property (list obj 'TextOverride "Transport Width = <>"))
      (vl-catch-all-apply 'vla-Update (list obj))))
  obj)

(defun sartd:v65-add-plan-transport-width-dim (planBase W planWidthRefX planWidthDimX / obj)
  ; Creates the right-hand plan-view overall width dimension as a normal SAR_DIM dimension.
  ; Text uses <> so AutoCAD writes the live measured width rather than hardcoded/bracket SPMT text.
  (setq obj
    (sartd:add-linear-dim-style
      (list planWidthRefX (cadr planBase))
      (list planWidthRefX (+ (cadr planBase) W))
      (list planWidthDimX (+ (cadr planBase) (/ W 2.0)))
      (/ pi 2.0)
      "Transport Width = <>"
      sartd:*dimstyle-standard*))
  (sartd:v65-force-standard-transport-width-dim obj)
  obj)

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp ppu overallStart overallEnd dimObj deckUpper deckLower minY maxY trWidth gap topOff lower1 lower2 sideRight loadDimX packDimX packTextX packTextY deckDimX transportDimX transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckTol deckMin deckMax deckLabel packDimObj axleStyle leftEdge rightEdge leftPpuEnd rightPpuStart)
  ; v65 override of the v62/v64 dimension routine.
  ; Main change: the plan-view right-side overall width dimension is always SAR_DIM and says
  ; "Transport Width = <>" so it cannot inherit SPMT bracket text such as [10 x 1500].
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq ppu (if firstTr (strcase (sartd:str (cdr (assoc 'ppu-state firstTr)))) "NONE"))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq axleStyle (sartd:v62-dimstyle-axle firstTr))
  (setq leftEdge (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0))
  (setq rightEdge (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen))
  (setq overallStart (+ (car sideBase) leftEdge))
  (setq overallEnd (+ (car sideBase) rightEdge))
  (setq leftPpuEnd (+ (car sideBase) trX))
  (setq rightPpuStart (+ (car sideBase) trX trLen))

  ; Plan view dimensions.
  (sartd:draw-dim-h (car planBase) (+ (car planBase) L) (+ (cadr planBase) W) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L))
  (setq planWidthRefX (+ (car planBase) maxTrailerRight))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:v65-add-plan-transport-width-dim planBase W planWidthRefX planWidthDimX)
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: use real equipment extents, including left/right PPUs.
  (sartd:draw-dim-h (car sideBase) (+ (car sideBase) L) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (if (or (= ppu "LEFT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style overallStart leftPpuEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h-style leftPpuEnd rightPpuStart (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") axleStyle)
  (if (or (= ppu "RIGHT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style rightPpuStart overallEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; Side-view height stack: scale-aware columns from the actual rightmost equipment extent.
  (setq sideRight (sartd:v62-side-right-visible-x data sideBase L))
  (setq loadDimX (+ sideRight (* 1.20 gap)))
  (setq packDimX (+ sideRight (* 2.35 gap)))
  (setq deckDimX (+ sideRight (* 3.70 gap)))
  (setq transportDimX (+ sideRight (* 5.05 gap)))
  (setq packTextX (+ sideRight (* 2.90 gap)))
  (setq packTextY (+ (cadr sideBase) loadBot (* 0.38 H)))

  (sartd:add-linear-dim-style (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                              (list loadDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)

  (if (> (abs pack) 0.5)
    (setq packDimObj
      (sartd:v61-add-packing-dim-with-leader
        (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
        (list (+ (car sideBase) L) (+ (cadr sideBase) loadBot))
        (list packDimX (+ (cadr sideBase) deck (/ pack 2.0)))
        (list packTextX packTextY)
        (strcat "Packing = " (sartd:fmt0 pack)))))

  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                (list (+ (car sideBase) L) (+ (cadr sideBase) loadTop))
                                (list transportDimX (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance from live Htrailer.
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr (strcat "v65 " deckLabel " live Htrailer tolerance: actual=" (sartd:fmt0 deck)
                    "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
                    "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) L) (cadr sideBase))
                                           (list (+ (car sideBase) L) (+ (cadr sideBase) deck))
                                           (list deckDimX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)
  (sartd:pr "v65 side-view dimensions use real PPU extents and wide, scale-aware height columns.")

  ; End view dimensions. Transport width sits on top, in line with side-view load length.
  (sartd:draw-dim-h (car endBase) (+ (car endBase) W) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  (setq endDimX (+ (car endBase) W 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) W) (cadr endBase))
                              (list (+ (car endBase) W) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (car endBase)) 1.0)
        (sartd:add-linear-dim-style (list (car endBase) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (car endBase) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (car endBase))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) W) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) W) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) W)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) W) endOuterRight)) sartd:*dimstyle-standard*)))))

(defun sartd:v65-draworder-option (mode / m)
  (setq m (strcase (sartd:str mode)))
  (cond
    ((or (= m "_BACK") (= m "BACK") (= m "B")) "B")
    ((or (= m "_FRONT") (= m "FRONT") (= m "F")) "F")
    ((or (= m "_ABOVE") (= m "ABOVE") (= m "A")) "A")
    ((or (= m "_UNDER") (= m "UNDER") (= m "U")) "U")
    (T m)))

(defun sartd:v65-with-model-tab (fn / oldCtab oldCmdecho res)
  ; DRAWORDER can only operate on objects in the current space. Since SARTDRUN normally ends in PaperSpace,
  ; switch to the Model tab temporarily before applying draw order to ModelSpace objects.
  (setq oldCtab (getvar "CTAB"))
  (setq oldCmdecho (getvar "CMDECHO"))
  (setvar "CMDECHO" 0)
  (if (/= (strcase (sartd:str oldCtab)) "MODEL")
    (vl-catch-all-apply 'setvar (list "CTAB" "Model")))
  (setq res (vl-catch-all-apply fn nil))
  (if (/= (strcase (sartd:str oldCtab)) "MODEL")
    (vl-catch-all-apply 'setvar (list "CTAB" oldCtab)))
  (setvar "CMDECHO" oldCmdecho)
  res)

(defun sartd:v62-draworder (ss mode / opt r)
  ; v65 override. Prevents:
  ;   "N were not in current space" and Unknown command "BACK" / "FRONT".
  (if (and ss (> (sslength ss) 0))
    (progn
      (setq opt (sartd:v65-draworder-option mode))
      (setq r
        (sartd:v65-with-model-tab
          (function
            (lambda ()
              (vl-catch-all-apply 'vl-cmdf (list "_.DRAWORDER" ss "" opt))))))
      (not (vl-catch-all-error-p r)))
    nil))

(defun c:SARTDRUN ()
  ; Main public command remains SARTDRUN only. Run workflow, then repeat draw-order once more at the end.
  (sartd:v50-clear-scale-cache)
  (sartd:v59-run-workflow)
  (sartd:v64-apply-draw-order)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v65 fixes the plan-view Transport Width dim text/style and makes draw-order run safely from the Model tab."))
(princ)


; =================================================================================================
; v0.9.9.4.3.66 CARGO EXTREME X/Y REFERENCE-POINT FIX
; - Reads C54 Extreme -X and C55 Extreme -Y from the active workbook/sheet.
; - Treats load Length/Width as size only, and Extreme X/Y as the bottom-left cargo corner from the
;   selected reference point.
; - Plan, side and end load outlines now shift correctly when the reference point is in the centre.
; - Load length/width dimensions, supports/packing strips, COG reference dimensions and viewport extents
;   now respect the actual load extents.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.66")

(defun sartd:v66-cellmm-safe (sh addr / r)
  (if sh
    (progn
      (setq r (vl-catch-all-apply 'sartd:cellmm (list sh addr)))
      (if (vl-catch-all-error-p r) 0.0 (sartd:num r 0.0)))
    0.0))

(defun sartd:v66-load-x0 (data / v sh)
  (setq v (cdr (assoc 'load-extreme-x data)))
  (if v
    (sartd:num v 0.0)
    (progn
      (setq sh (sartd:g 'sheet-main data))
      (sartd:v66-cellmm-safe sh "C54"))))

(defun sartd:v66-load-y0 (data / v sh)
  (setq v (cdr (assoc 'load-extreme-y data)))
  (if v
    (sartd:num v 0.0)
    (progn
      (setq sh (sartd:g 'sheet-main data))
      (sartd:v66-cellmm-safe sh "C55"))))

(defun sartd:v66-load-x1 (data)
  (+ (sartd:v66-load-x0 data) (sartd:g 'load-length data)))

(defun sartd:v66-load-y1 (data)
  (+ (sartd:v66-load-y0 data) (sartd:g 'load-width data)))

(defun sartd:v66-valid-support-x-list (data / xs x0 x1 out)
  ; Support X values are now treated as coordinates from the selected reference point, not distances
  ; from the load's left edge. Empty spreadsheet support rows are normally 0, so retain the previous
  ; safe behaviour and only use non-zero support positions.
  (setq xs (sartd:g 'support-x data))
  (setq out nil)
  (foreach x xs
    (setq x (sartd:num x 0.0))
    (if (> (abs x) 1.0)
      (setq out (append out (list x)))))
  out)

(defun sartd:v66-add-plan-transport-width-dim (planBase y0 y1 planWidthRefX planWidthDimX / obj)
  (setq obj
    (sartd:add-linear-dim-style
      (list planWidthRefX (+ (cadr planBase) y0))
      (list planWidthRefX (+ (cadr planBase) y1))
      (list planWidthDimX (+ (cadr planBase) (/ (+ y0 y1) 2.0)))
      (/ pi 2.0)
      "Transport Width = <>"
      sartd:*dimstyle-standard*))
  (sartd:v65-force-standard-transport-width-dim obj)
  obj)

(defun sartd:draw-plan-trailer-spacing-dims (data planBase / trailers sorted x lastY lastRef pair y refX txt minEquipX refs y0 y1)
  ; v66: left-side plan spacing dims now measure from real cargo Y envelope: Extreme-Y to Extreme-Y + Width.
  (setq trailers (sartd:g 'trailers data))
  (setq y0 (sartd:v66-load-y0 data))
  (setq y1 (sartd:v66-load-y1 data))
  (setq minEquipX
    (if trailers
      (apply 'min (mapcar '(lambda (tr) (+ (car planBase) (sartd:trailer-ppu-left-edge tr))) trailers))
      (car planBase)))
  (setq x (- minEquipX 700.0))
  (setq refs
    (mapcar
      '(lambda (tr) (list (cdr (assoc 'y tr)) (sartd:plan-left-ref-x-for-trailer tr planBase)))
      trailers))
  (setq sorted (vl-sort refs '(lambda (a b) (< (car a) (car b)))))
  (if sorted
    (progn
      (setq lastY y0)
      (setq lastRef (cadr (car sorted)))
      (foreach pair sorted
        (setq y (car pair))
        (setq refX (cadr pair))
        (setq txt (sartd:fmt0 (- y lastY)))
        (if (> (abs (- y lastY)) 1.0)
          (sartd:draw-dim-v-between-refs lastRef refX x (+ (cadr planBase) lastY) (+ (cadr planBase) y) txt))
        (setq lastY y)
        (setq lastRef refX))
      (if (> (abs (- y1 lastY)) 1.0)
        (sartd:draw-dim-v-between-refs lastRef lastRef x (+ (cadr planBase) lastY) (+ (cadr planBase) y1) (sartd:fmt0 (- y1 lastY)))))))

(defun sartd:draw-plan-support-spacing-dims (data planBase / supportX pts last p y x0 x1)
  ; v66: bottom chain dimensions now run from real cargo X envelope: Extreme-X to Extreme-X + Length.
  (setq x0 (sartd:v66-load-x0 data))
  (setq x1 (sartd:v66-load-x1 data))
  (setq supportX (sartd:v66-valid-support-x-list data))
  (setq supportX (vl-remove-if '(lambda (v) (or (< v x0) (> v x1))) supportX))
  (setq supportX (sartd:sortnums supportX))
  (setq pts (append (list x0) supportX (list x1)))
  (setq y (- (cadr planBase) (* 1.7 (sartd:auto-dim-gap))))
  (setq last (car pts))
  (foreach p (cdr pts)
    (if (> (abs (- p last)) 1.0)
      (sartd:draw-dim-h (+ (car planBase) last) (+ (car planBase) p) (cadr planBase) (- y (cadr planBase)) (sartd:fmt0 (- p last))))
    (setq last p)))

(defun sartd:draw-basic-dimensions (data planBase sideBase endBase maxLen endWidth / L W H deck pack loadBot loadTop supportX sx ppuLen trailers firstTr trX trLen ax sp ppu overallStart overallEnd dimObj deckUpper deckLower minY maxY trWidth gap topOff lower1 lower2 sideRight loadDimX packDimX packTextX packTextY deckDimX transportDimX transportDim maxTrailerRight planWidthRefX planWidthDimX endDimX endDimX2 endBottomDimY endOuterLeft endOuterRight deckTol deckMin deckMax deckLabel packDimObj axleStyle leftEdge rightEdge leftPpuEnd rightPpuStart x0 x1 y0 y1)
  ; v66 override: every load dimension uses real cargo extreme X/Y from cells C54/C55.
  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq x0 (sartd:v66-load-x0 data))
  (setq x1 (sartd:v66-load-x1 data))
  (setq y0 (sartd:v66-load-y0 data))
  (setq y1 (sartd:v66-load-y1 data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq supportX (sartd:g 'support-x data))
  (setq trailers (sartd:g 'trailers data))
  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower1 (* -2.0 gap))
  (setq lower2 (* -3.2 gap))
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ax (if firstTr (cdr (assoc 'axles firstTr)) 0))
  (setq sp (if firstTr (cdr (assoc 'spacing firstTr)) 1400.0))
  (setq ppu (if firstTr (strcase (sartd:str (cdr (assoc 'ppu-state firstTr)))) "NONE"))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq axleStyle (sartd:v62-dimstyle-axle firstTr))
  (setq leftEdge (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0))
  (setq rightEdge (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen))
  (setq overallStart (+ (car sideBase) leftEdge))
  (setq overallEnd (+ (car sideBase) rightEdge))
  (setq leftPpuEnd (+ (car sideBase) trX))
  (setq rightPpuStart (+ (car sideBase) trX trLen))

  ; Plan view dimensions use the actual cargo rectangle envelope.
  (sartd:draw-dim-h (+ (car planBase) x0) (+ (car planBase) x1) (+ (cadr planBase) y1) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) x1))
  (setq planWidthRefX (+ (car planBase) (max maxTrailerRight x1)))
  (setq planWidthDimX (+ planWidthRefX 700.0))
  (sartd:v66-add-plan-transport-width-dim planBase y0 y1 planWidthRefX planWidthDimX)
  (sartd:draw-plan-trailer-spacing-dims data planBase)
  (sartd:draw-plan-support-spacing-dims data planBase)

  ; Side view dimensions: load length spans actual X envelope; transport length uses equipment extents.
  (sartd:draw-dim-h (+ (car sideBase) x0) (+ (car sideBase) x1) (+ (cadr sideBase) loadTop) topOff
                    (strcat "Load Length = " (sartd:fmt0 L)))
  (if (or (= ppu "LEFT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style overallStart leftPpuEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h-style leftPpuEnd rightPpuStart (cadr sideBase) lower1
                         (strcat (sartd:fmt0 trLen) " [" (itoa ax) " x " (sartd:fmt0 sp) "]") axleStyle)
  (if (or (= ppu "RIGHT") (= ppu "BOTH"))
    (sartd:draw-dim-h-style rightPpuStart overallEnd (cadr sideBase) lower1
                           (strcat "PPU = " (sartd:fmt0 ppuLen)) sartd:*dimstyle-standard*))
  (sartd:draw-dim-h overallStart overallEnd (cadr sideBase) lower2
                    (strcat "Transport Length = " (sartd:fmt0 (- overallEnd overallStart))))

  ; Side-view height stack: right of the real load/equipment envelope.
  (setq sideRight (max (sartd:v62-side-right-visible-x data sideBase x1) (+ (car sideBase) x1)))
  (setq loadDimX (+ sideRight (* 1.20 gap)))
  (setq packDimX (+ sideRight (* 2.35 gap)))
  (setq deckDimX (+ sideRight (* 3.70 gap)))
  (setq transportDimX (+ sideRight (* 5.05 gap)))
  (setq packTextX (+ sideRight (* 2.90 gap)))
  (setq packTextY (+ (cadr sideBase) loadBot (* 0.38 H)))

  (sartd:add-linear-dim-style (list (+ (car sideBase) x1) (+ (cadr sideBase) loadBot))
                              (list (+ (car sideBase) x1) (+ (cadr sideBase) loadTop))
                              (list loadDimX (/ (+ (+ (cadr sideBase) loadBot) (+ (cadr sideBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)

  (if (> (abs pack) 0.5)
    (setq packDimObj
      (sartd:v61-add-packing-dim-with-leader
        (list (+ (car sideBase) x1) (+ (cadr sideBase) deck))
        (list (+ (car sideBase) x1) (+ (cadr sideBase) loadBot))
        (list packDimX (+ (cadr sideBase) deck (/ pack 2.0)))
        (list packTextX packTextY)
        (strcat "Packing = " (sartd:fmt0 pack)))))

  (setq transportDim
    (sartd:add-linear-dim-style (list (+ (car sideBase) x1) (cadr sideBase))
                                (list (+ (car sideBase) x1) (+ (cadr sideBase) loadTop))
                                (list transportDimX (/ (+ (cadr sideBase) (+ (cadr sideBase) loadTop)) 2.0))
                                (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*))

  ; Deck / ride height tolerance from live Htrailer.
  (setq deckTol (sartd:v58-deck-height-limits data))
  (setq deckMin (car deckTol))
  (setq deckMax (cadr deckTol))
  (setq deckLabel (caddr deckTol))
  (setq deckUpper (max 0.0 (- deckMax deck)))
  (setq deckLower (max 0.0 (- deck deckMin)))
  (sartd:pr (strcat "v66 " deckLabel " live Htrailer tolerance: actual=" (sartd:fmt0 deck)
                    "mm, range=" (sartd:fmt0 deckMin) "-" (sartd:fmt0 deckMax)
                    "mm, remaining +" (sartd:fmt0 deckUpper) " / -" (sartd:fmt0 deckLower) "mm."))
  (setq dimObj (sartd:add-linear-dim-style (list (+ (car sideBase) x1) (cadr sideBase))
                                           (list (+ (car sideBase) x1) (+ (cadr sideBase) deck))
                                           (list deckDimX (+ (cadr sideBase) (/ deck 2.0)))
                                           (/ pi 2.0) "" sartd:*dimstyle-standard*))
  (sartd:apply-dim-tolerance dimObj deckUpper deckLower)
  (sartd:apply-dim-tolerance transportDim deckUpper deckLower)

  ; End view dimensions. In end view X-axis is cargo Y, so use Extreme-Y to Extreme-Y + Width.
  (sartd:draw-dim-h (+ (car endBase) y0) (+ (car endBase) y1) (+ (cadr endBase) loadTop) topOff
                    (strcat "Transport Width = " (sartd:fmt0 W)))
  (setq endDimX (+ (car endBase) y1 700.0))
  (setq endDimX2 (+ endDimX gap))
  (sartd:add-linear-dim-style (list (+ (car endBase) y1) (+ (cadr endBase) loadBot))
                              (list (+ (car endBase) y1) (+ (cadr endBase) loadTop))
                              (list endDimX (/ (+ (+ (cadr endBase) loadBot) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Load Height = " (sartd:fmt0 H)) sartd:*dimstyle-standard*)
  (sartd:add-linear-dim-style (list (+ (car endBase) y1) (cadr endBase))
                              (list (+ (car endBase) y1) (+ (cadr endBase) loadTop))
                              (list endDimX2 (/ (+ (cadr endBase) (+ (cadr endBase) loadTop)) 2.0))
                              (/ pi 2.0) (strcat "Transport Height = " (sartd:fmt0 loadTop)) sartd:*dimstyle-standard*)
  ; Bottom chain dimensions: left clearance, trailer pack width, right clearance, all relative to real Y envelope.
  (if trailers
    (progn
      (setq trWidth (cdr (assoc 'width (car trailers))))
      (setq minY (apply 'min (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq maxY (apply 'max (mapcar '(lambda (tr) (cdr (assoc 'y tr))) trailers)))
      (setq endOuterLeft (+ (car endBase) minY (- (/ trWidth 2.0))))
      (setq endOuterRight (+ (car endBase) maxY (/ trWidth 2.0)))
      (setq endBottomDimY (- (cadr endBase) (* 1.5 gap)))
      (if (> (- endOuterLeft (+ (car endBase) y0)) 1.0)
        (sartd:add-linear-dim-style (list (+ (car endBase) y0) (cadr endBase)) (list endOuterLeft (cadr endBase))
                                    (list (/ (+ (+ (car endBase) y0) endOuterLeft) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterLeft (+ (car endBase) y0))) sartd:*dimstyle-standard*))
      (if (> (- endOuterRight endOuterLeft) 1.0)
        (sartd:add-linear-dim-style (list endOuterLeft (cadr endBase)) (list endOuterRight (cadr endBase))
                                    (list (/ (+ endOuterLeft endOuterRight) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- endOuterRight endOuterLeft)) sartd:*dimstyle-standard*))
      (if (> (- (+ (car endBase) y1) endOuterRight) 1.0)
        (sartd:add-linear-dim-style (list endOuterRight (cadr endBase)) (list (+ (car endBase) y1) (cadr endBase))
                                    (list (/ (+ endOuterRight (+ (car endBase) y1)) 2.0) endBottomDimY) 0.0
                                    (sartd:fmt0 (- (+ (car endBase) y1) endOuterRight)) sartd:*dimstyle-standard*)))))

(defun sartd:draw-arrangement (data base / L W H deck pack loadBot loadTop planBase sideBase endBase
                                      maxLen maxY minY viewGapX viewGapY trailers tr br x y len wid ax sp ppu
                                      sideTr frontBr supportX supportW sx ex envx envy cx cy cz ccx ccy ccz endWidth
                                      trCount distance clearGap firstTr brand cargoWt combWt frontX frontTr ppuLen trX trLen
                                      groundStart groundEnd trWidth endGroundStart endGroundEnd endLeft endRight coordPlan coordSide coordEnd sideLeft sideRight planTopAllowance
                                      gap topOff lower2 sideDimX2 endDimX2 maxTrailerRight minEquipLeft extMinX extMinY extMaxX extMaxY
                                      x0 x1 y0 y1 planTopY planBottomY)
  ; v66 override: the picked base point is the cargo reference point. C54/C55 define the cargo's
  ; lower-left extreme from that reference point. This fixes centre-reference cargo layouts.
  (sartd:ensure-core-blocks)

  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq x0 (sartd:v66-load-x0 data))
  (setq x1 (sartd:v66-load-x1 data))
  (setq y0 (sartd:v66-load-y0 data))
  (setq y1 (sartd:v66-load-y1 data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq trailers (sartd:g 'trailers data))
  (setq trCount (length trailers))
  (setq minY (sartd:g 'trailer-y-min data))
  (setq maxY (sartd:g 'trailer-y-max data))
  (setq distance (- maxY minY))
  (if (< distance 0.0) (setq distance 0.0))
  (setq clearGap (- distance (if trailers (cdr (assoc 'width (car trailers))) 0.0)))
  (if (< clearGap 0.0) (setq clearGap 0.0))

  (setq maxLen (max x1 L (if trailers (apply 'max (mapcar '(lambda (xx) (cdr (assoc 'length xx))) trailers)) L)))
  (setq endWidth (max W (+ clearGap (if trailers (cdr (assoc 'width (car trailers))) 0.0))))
  (setq viewGapY sartd:*view-gap-y*)
  (setq viewGapX sartd:*view-gap-x*)

  (setq planBase base)
  (setq sideLeft (min x0 0.0 (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0)))
  (setq sideRight (max x1 L (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L)))
  (setq planTopY (max y1 W (if trailers (apply 'max (mapcar '(lambda (tr) (+ (cdr (assoc 'y tr)) (/ (cdr (assoc 'width tr)) 2.0))) trailers)) y1)))
  (setq planBottomY (min y0 0.0 (if trailers (apply 'min (mapcar '(lambda (tr) (- (cdr (assoc 'y tr)) (/ (cdr (assoc 'width tr)) 2.0))) trailers)) y0)))
  (if (and (boundp 'sartd:*auto-spacing-active*) sartd:*auto-spacing-active*)
    (progn
      (setq viewGapX (sartd:auto-view-gap-x data))
      (setq viewGapY (sartd:auto-view-clear-y data))
      (setq planTopAllowance (+ planTopY (sartd:auto-title-clearance) (* 2.0 (sartd:auto-dim-gap))))
      (setq sideBase (list (car base) (+ (cadr base) planTopAllowance (* 3.4 (sartd:auto-dim-gap)) viewGapY) 0.0)))
    (setq sideBase (list (car base) (+ (cadr base) loadTop viewGapY) 0.0)))
  (setq endBase  (list (+ (car sideBase) sideRight 700.0 (* 2.2 (sartd:auto-dim-gap)) viewGapX) (cadr sideBase) 0.0))

  (sartd:draw-view-label "SIDE VIEW" (+ (car sideBase) x0) (+ (car sideBase) x1) (+ (cadr sideBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "END VIEW"  (+ (car endBase) y0)  (+ (car endBase) y1) (+ (cadr endBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "PLAN VIEW" (+ (car planBase) x0) (+ (car planBase) x1) (+ (cadr planBase) y1 (sartd:auto-title-clearance)))

  (foreach tr trailers
    (sartd:draw-trailer-blocks-split tr "TOP" planBase deck))
  (sartd:draw-hydraulic-groups data planBase)

  (sartd:pr "Stage: side-view trailer block...")
  (if trailers
    (progn
      (setq firstTr (car trailers))
      (sartd:draw-trailer-blocks-split firstTr "SIDE" sideBase deck)))

  (sartd:pr "Stage: side-view pinned axle markers...")
  (sartd:draw-side-pinned-axles data sideBase)

  (sartd:pr "Stage: end-view trailer blocks...")
  (foreach frontTr trailers
    (setq frontX (+ (car endBase) (cdr (assoc 'y frontTr))))
    (setq frontBr (sartd:insert-block (sartd:trailer-block-name frontTr "FRONT") (list frontX (+ (cadr endBase) deck) 0.0) "0"))
    (if frontBr
      (progn
        (sartd:configure-trailer-block frontBr frontTr "FRONT" deck)
        (sartd:tag (vlax-vla-object->ename frontBr) "TRAILER_BLOCK"))))

  (sartd:pr "Stage: ground blocks...")
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq groundStart (+ (car sideBase) (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0) (- sartd:*ground-overrun*)))
  (setq groundEnd   (+ (car sideBase) (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen) sartd:*ground-overrun*))
  (sartd:draw-ground-range groundStart groundEnd (cadr sideBase) "GROUND / Z=0")
  (setq trWidth (if firstTr (cdr (assoc 'width firstTr)) 0.0))
  (setq endGroundStart (+ (car endBase) minY (- (/ trWidth 2.0)) (- sartd:*ground-overrun*)))
  (setq endGroundEnd   (+ (car endBase) maxY (/ trWidth 2.0) sartd:*ground-overrun*))
  (sartd:draw-ground-range endGroundStart endGroundEnd (cadr endBase) "GROUND / Z=0")

  (sartd:pr "Stage: load outline...")
  (sartd:add-rect (+ (car planBase) x0) (+ (cadr planBase) y0) (+ (car planBase) x1) (+ (cadr planBase) y1) sartd:*layer-load*)
  (sartd:add-rect (+ (car sideBase) x0) (+ (cadr sideBase) loadBot) (+ (car sideBase) x1) (+ (cadr sideBase) loadTop) sartd:*layer-load*)
  (sartd:add-rect (+ (car endBase) y0) (+ (cadr endBase) loadBot) (+ (car endBase) y1) (+ (cadr endBase) loadTop) sartd:*layer-load*)

  (sartd:pr "Stage: packing/supports...")
  (setq supportX (sartd:v66-valid-support-x-list data))
  (setq supportW 400.0)
  (foreach sx supportX
    (if (and (>= sx x0) (<= sx x1))
      (progn
        (sartd:add-rect (+ (car planBase) sx (- (/ supportW 2.0))) (+ (cadr planBase) y0)
                        (+ (car planBase) sx (/ supportW 2.0)) (+ (cadr planBase) y1) "SARTD-PACKING")
        (sartd:add-rect (+ (car sideBase) sx (- (/ supportW 2.0))) (+ (cadr sideBase) deck)
                        (+ (car sideBase) sx (/ supportW 2.0)) (+ (cadr sideBase) loadBot) "SARTD-PACKING"))))
  (sartd:add-rect (+ (car endBase) y0) (+ (cadr endBase) deck) (+ (car endBase) y1) (+ (cadr endBase) loadBot) "SARTD-PACKING")

  (sartd:pr "Stage: COG and datum blocks...")
  (setq cx (sartd:g 'cargo-cog-x data))
  (setq cy (sartd:g 'cargo-cog-y data))
  (setq cz (+ loadBot (sartd:g 'cargo-cog-z data)))
  (setq ccx (sartd:g 'combined-cog-x data))
  (setq ccy (sartd:g 'combined-cog-y data))
  (setq ccz (sartd:g 'combined-cog-z data))
  (setq cargoWt (sartd:g 'cargo-weight data))
  (setq combWt  (sartd:g 'combined-weight data))

  (setq coordPlan (list (car planBase) (cadr planBase) 0.0))
  (setq coordSide (list (car sideBase) (+ (cadr sideBase) loadBot) 0.0))
  (setq coordEnd  (list (car endBase)  (+ (cadr endBase) loadBot) 0.0))
  (sartd:draw-coordinate-symbol coordPlan "X-Y")
  (sartd:draw-coordinate-symbol coordSide "X-Z")
  (sartd:draw-coordinate-symbol coordEnd  "Y-Z")

  (sartd:v62-draw-plan-cogs data planBase)
  (sartd:draw-cog (+ (car sideBase) cx) (+ (cadr sideBase) cz) "CARGO COG" cargoWt)
  (sartd:draw-cog (+ (car endBase) cy) (+ (cadr endBase) cz) "CARGO COG" cargoWt)
  (sartd:draw-cog (+ (car sideBase) ccx) (+ (cadr sideBase) ccz) "COMBINED COG" combWt)
  (sartd:draw-cog (+ (car endBase) ccy) (+ (cadr endBase) ccz) "COMBINED COG" combWt)

  (sartd:pr "Stage: dimensions...")
  (sartd:draw-basic-dimensions data planBase sideBase endBase maxLen endWidth)
  (sartd:draw-cog-origin-dims coordPlan (list (+ (car planBase) cx) (+ (cadr planBase) cy)) "X-Y")
  (sartd:draw-cog-origin-dims coordSide (list (+ (car sideBase) cx) (+ (cadr sideBase) cz)) "X-Z")
  (sartd:draw-cog-origin-dims coordEnd  (list (+ (car endBase) cy) (+ (cadr endBase) cz)) "Y-Z")

  (sartd:pr "Stage: COG envelope and extents...")
  (setq envx (sartd:g 'cog-env-x data))
  (setq envy (sartd:g 'cog-env-y data))
  (if (or (> envx 0.0) (> envy 0.0))
    (sartd:add-rect (+ (car planBase) cx (- envx)) (+ (cadr planBase) cy (- envy))
                    (+ (car planBase) cx envx) (+ (cadr planBase) cy envy) "SARTD-COG"))

  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower2 (* -3.2 gap))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) x1))
  (setq minEquipLeft (if trailers (min x0 0.0 (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers))) (min x0 0.0)))
  (setq sideDimX2 (+ (car sideBase) sideRight (* 6.0 gap)))
  (setq endDimX2 (+ (car endBase) y1 700.0 gap))
  (setq extMinX
    (min
      (+ (car planBase) minEquipLeft (- 1200.0))
      (+ (car planBase) x0 (- gap))
      (- groundStart gap)
      (+ (car sideBase) minEquipLeft (- gap))
      (+ (car sideBase) x0 (- gap))))
  (setq extMaxX
    (max
      (+ (car planBase) (max maxTrailerRight x1) (max 6500.0 (* 6.0 gap)))
      sideDimX2
      endDimX2
      endGroundEnd
      (+ (car endBase) y1 (* 2.0 gap))
      (+ (car sideBase) sideRight (* 6.0 gap))))
  (setq extMinY
    (min
      (+ (cadr planBase) planBottomY (- (* 3.8 gap)))
      (- (cadr sideBase) (* 3.5 gap))
      (- (cadr endBase) (* 2.2 gap))))
  (setq extMaxY
    (max
      (+ (cadr sideBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr endBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr planBase) planTopY topOff (sartd:auto-title-clearance) (* 0.5 gap))))
  (sartd:save-extents (list extMinX extMinY) (list extMaxX extMaxY))
  (sartd:v62-apply-draw-order)
  (sartd:pr (strcat "Arrangement drawn in ModelSpace using cargo reference extremes: X0="
                    (sartd:fmt0 x0) "mm, Y0=" (sartd:fmt0 y0) "mm.")))

(defun c:SARTDRUN ()
  (sartd:v50-clear-scale-cache)
  (sartd:v59-run-workflow)
  (sartd:v64-apply-draw-order)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v66 fixes cargo Extreme-X/Extreme-Y reference-point offsets from C54/C55."))
(princ)

; =================================================================================================
; v0.9.9.4.3.67 PROTECTED VIEW-ENVELOPE SPACING
; - Uses protected SIDE / PLAN / END view envelopes rather than only load/trailer geometry.
; - Reserves space for plan-view top dimensions/title, side-view bottom dimensions, side-view right
;   height-dimension columns and END-view negative cargo/trailer offsets.
; - Keeps v66 Extreme-X / Extreme-Y reference point behaviour.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.67")

(defun sartd:draw-arrangement (data base / L W H deck pack loadBot loadTop planBase sideBase endBase
                                      maxLen maxY minY viewGapX viewGapY trailers tr br x y len wid ax sp ppu
                                      sideTr frontBr supportX supportW sx ex envx envy cx cy cz ccx ccy ccz endWidth
                                      trCount distance clearGap firstTr brand cargoWt combWt frontX frontTr ppuLen trX trLen
                                      groundStart groundEnd trWidth endGroundStart endGroundEnd endLeft endRight coordPlan coordSide coordEnd sideLeft sideRight planTopAllowance
                                      gap topOff lower2 sideDimX2 endDimX2 maxTrailerRight minEquipLeft extMinX extMinY extMaxX extMaxY
                                      x0 x1 y0 y1 planTopY planBottomY sideBottomAllowance sideRightEnvelope endLeftRel)
   ; v67 override: same cargo Extreme-X/Y reference behaviour as v66, but view positions are now
  ; based on protected view envelopes so dimensions/text/leaders from one view do not run into another.
  (sartd:ensure-core-blocks)

  (setq L (sartd:g 'load-length data))
  (setq W (sartd:g 'load-width data))
  (setq H (sartd:g 'load-height data))
  (setq x0 (sartd:v66-load-x0 data))
  (setq x1 (sartd:v66-load-x1 data))
  (setq y0 (sartd:v66-load-y0 data))
  (setq y1 (sartd:v66-load-y1 data))
  (setq deck (sartd:g 'deck-height data))
  (setq pack (sartd:g 'packing-height data))
  (setq loadBot (+ deck pack))
  (setq loadTop (+ loadBot H))
  (setq trailers (sartd:g 'trailers data))
  (setq trCount (length trailers))
  (setq minY (sartd:g 'trailer-y-min data))
  (setq maxY (sartd:g 'trailer-y-max data))
  (setq distance (- maxY minY))
  (if (< distance 0.0) (setq distance 0.0))
  (setq clearGap (- distance (if trailers (cdr (assoc 'width (car trailers))) 0.0)))
  (if (< clearGap 0.0) (setq clearGap 0.0))

  (setq maxLen (max x1 L (if trailers (apply 'max (mapcar '(lambda (xx) (cdr (assoc 'length xx))) trailers)) L)))
  (setq endWidth (max W (+ clearGap (if trailers (cdr (assoc 'width (car trailers))) 0.0))))
  (setq viewGapY sartd:*view-gap-y*)
  (setq viewGapX sartd:*view-gap-x*)
  (setq gap (sartd:auto-dim-gap))

  (setq planBase base)
  (setq sideLeft (min x0 0.0 (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0)))
  (setq sideRight (max x1 L (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) L)))
  (setq planTopY (max y1 W (if trailers (apply 'max (mapcar '(lambda (tr) (+ (cdr (assoc 'y tr)) (/ (cdr (assoc 'width tr)) 2.0))) trailers)) y1)))
  (setq planBottomY (min y0 0.0 (if trailers (apply 'min (mapcar '(lambda (tr) (- (cdr (assoc 'y tr)) (/ (cdr (assoc 'width tr)) 2.0))) trailers)) y0)))

  ; v67 protected view envelopes.
  ; PLAN top envelope includes load/trailer outline, load-length dimension and title.
  ; SIDE bottom allowance includes transport length / PPU / axle chain dimensions below the ground line.
  ; SIDE right envelope includes the right-hand height dimension columns before placing the END view.
  (if (and (boundp 'sartd:*auto-spacing-active*) sartd:*auto-spacing-active*)
    (progn
      (setq viewGapX (sartd:auto-view-gap-x data))
      (setq viewGapY (sartd:auto-view-clear-y data))))
  (setq planTopAllowance (+ planTopY (sartd:auto-title-clearance) (* 3.2 gap)))
  (setq sideBottomAllowance (* 4.9 gap))
  (setq sideBase (list (car base) (+ (cadr base) planTopAllowance sideBottomAllowance viewGapY) 0.0))

  ; END view may have negative Y-extreme cargo or trailer rows, so offset by the left envelope too.
  (setq trWidth (if trailers (cdr (assoc 'width (car trailers))) 0.0))
  (setq endLeftRel (min y0 0.0 (if trailers (apply 'min (mapcar '(lambda (tr) (- (cdr (assoc 'y tr)) (/ (cdr (assoc 'width tr)) 2.0))) trailers)) 0.0)))
  (setq sideRightEnvelope (+ sideRight (max 5000.0 (* 6.8 gap))))
  (setq endBase (list (+ (car sideBase) sideRightEnvelope viewGapX (- endLeftRel)) (cadr sideBase) 0.0))
  (sartd:pr (strcat "v67 protected view-envelope spacing applied. Side raised by "
                    (sartd:fmt0 (+ planTopAllowance sideBottomAllowance viewGapY))
                    "mm; END starts after side height-dim envelope."))

  (sartd:draw-view-label "SIDE VIEW" (+ (car sideBase) x0) (+ (car sideBase) x1) (+ (cadr sideBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "END VIEW"  (+ (car endBase) y0)  (+ (car endBase) y1) (+ (cadr endBase) loadTop (sartd:auto-title-clearance)))
  (sartd:draw-view-label "PLAN VIEW" (+ (car planBase) x0) (+ (car planBase) x1) (+ (cadr planBase) y1 (sartd:auto-title-clearance)))

  (foreach tr trailers
    (sartd:draw-trailer-blocks-split tr "TOP" planBase deck))
  (sartd:draw-hydraulic-groups data planBase)

  (sartd:pr "Stage: side-view trailer block...")
  (if trailers
    (progn
      (setq firstTr (car trailers))
      (sartd:draw-trailer-blocks-split firstTr "SIDE" sideBase deck)))

  (sartd:pr "Stage: side-view pinned axle markers...")
  (sartd:draw-side-pinned-axles data sideBase)

  (sartd:pr "Stage: end-view trailer blocks...")
  (foreach frontTr trailers
    (setq frontX (+ (car endBase) (cdr (assoc 'y frontTr))))
    (setq frontBr (sartd:insert-block (sartd:trailer-block-name frontTr "FRONT") (list frontX (+ (cadr endBase) deck) 0.0) "0"))
    (if frontBr
      (progn
        (sartd:configure-trailer-block frontBr frontTr "FRONT" deck)
        (sartd:tag (vlax-vla-object->ename frontBr) "TRAILER_BLOCK"))))

  (sartd:pr "Stage: ground blocks...")
  (setq firstTr (if trailers (car trailers) nil))
  (setq trX (if firstTr (cdr (assoc 'x firstTr)) 0.0))
  (setq trLen (if firstTr (cdr (assoc 'length firstTr)) maxLen))
  (setq ppuLen (if firstTr (sartd:trailer-ppu-length firstTr) 4300.0))
  (setq groundStart (+ (car sideBase) (if trailers (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers)) 0.0) (- sartd:*ground-overrun*)))
  (setq groundEnd   (+ (car sideBase) (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) maxLen) sartd:*ground-overrun*))
  (sartd:draw-ground-range groundStart groundEnd (cadr sideBase) "GROUND / Z=0")
  (setq trWidth (if firstTr (cdr (assoc 'width firstTr)) 0.0))
  (setq endGroundStart (+ (car endBase) minY (- (/ trWidth 2.0)) (- sartd:*ground-overrun*)))
  (setq endGroundEnd   (+ (car endBase) maxY (/ trWidth 2.0) sartd:*ground-overrun*))
  (sartd:draw-ground-range endGroundStart endGroundEnd (cadr endBase) "GROUND / Z=0")

  (sartd:pr "Stage: load outline...")
  (sartd:add-rect (+ (car planBase) x0) (+ (cadr planBase) y0) (+ (car planBase) x1) (+ (cadr planBase) y1) sartd:*layer-load*)
  (sartd:add-rect (+ (car sideBase) x0) (+ (cadr sideBase) loadBot) (+ (car sideBase) x1) (+ (cadr sideBase) loadTop) sartd:*layer-load*)
  (sartd:add-rect (+ (car endBase) y0) (+ (cadr endBase) loadBot) (+ (car endBase) y1) (+ (cadr endBase) loadTop) sartd:*layer-load*)

  (sartd:pr "Stage: packing/supports...")
  (setq supportX (sartd:v66-valid-support-x-list data))
  (setq supportW 400.0)
  (foreach sx supportX
    (if (and (>= sx x0) (<= sx x1))
      (progn
        (sartd:add-rect (+ (car planBase) sx (- (/ supportW 2.0))) (+ (cadr planBase) y0)
                        (+ (car planBase) sx (/ supportW 2.0)) (+ (cadr planBase) y1) "SARTD-PACKING")
        (sartd:add-rect (+ (car sideBase) sx (- (/ supportW 2.0))) (+ (cadr sideBase) deck)
                        (+ (car sideBase) sx (/ supportW 2.0)) (+ (cadr sideBase) loadBot) "SARTD-PACKING"))))
  (sartd:add-rect (+ (car endBase) y0) (+ (cadr endBase) deck) (+ (car endBase) y1) (+ (cadr endBase) loadBot) "SARTD-PACKING")

  (sartd:pr "Stage: COG and datum blocks...")
  (setq cx (sartd:g 'cargo-cog-x data))
  (setq cy (sartd:g 'cargo-cog-y data))
  (setq cz (+ loadBot (sartd:g 'cargo-cog-z data)))
  (setq ccx (sartd:g 'combined-cog-x data))
  (setq ccy (sartd:g 'combined-cog-y data))
  (setq ccz (sartd:g 'combined-cog-z data))
  (setq cargoWt (sartd:g 'cargo-weight data))
  (setq combWt  (sartd:g 'combined-weight data))

  (setq coordPlan (list (car planBase) (cadr planBase) 0.0))
  (setq coordSide (list (car sideBase) (+ (cadr sideBase) loadBot) 0.0))
  (setq coordEnd  (list (car endBase)  (+ (cadr endBase) loadBot) 0.0))
  (sartd:draw-coordinate-symbol coordPlan "X-Y")
  (sartd:draw-coordinate-symbol coordSide "X-Z")
  (sartd:draw-coordinate-symbol coordEnd  "Y-Z")

  (sartd:v62-draw-plan-cogs data planBase)
  (sartd:draw-cog (+ (car sideBase) cx) (+ (cadr sideBase) cz) "CARGO COG" cargoWt)
  (sartd:draw-cog (+ (car endBase) cy) (+ (cadr endBase) cz) "CARGO COG" cargoWt)
  (sartd:draw-cog (+ (car sideBase) ccx) (+ (cadr sideBase) ccz) "COMBINED COG" combWt)
  (sartd:draw-cog (+ (car endBase) ccy) (+ (cadr endBase) ccz) "COMBINED COG" combWt)

  (sartd:pr "Stage: dimensions...")
  (sartd:draw-basic-dimensions data planBase sideBase endBase maxLen endWidth)
  (sartd:draw-cog-origin-dims coordPlan (list (+ (car planBase) cx) (+ (cadr planBase) cy)) "X-Y")
  (sartd:draw-cog-origin-dims coordSide (list (+ (car sideBase) cx) (+ (cadr sideBase) cz)) "X-Z")
  (sartd:draw-cog-origin-dims coordEnd  (list (+ (car endBase) cy) (+ (cadr endBase) cz)) "Y-Z")

  (sartd:pr "Stage: COG envelope and extents...")
  (setq envx (sartd:g 'cog-env-x data))
  (setq envy (sartd:g 'cog-env-y data))
  (if (or (> envx 0.0) (> envy 0.0))
    (sartd:add-rect (+ (car planBase) cx (- envx)) (+ (cadr planBase) cy (- envy))
                    (+ (car planBase) cx envx) (+ (cadr planBase) cy envy) "SARTD-COG"))

  (setq gap (sartd:auto-dim-gap))
  (setq topOff (* 1.25 gap))
  (setq lower2 (* -3.2 gap))
  (setq maxTrailerRight (if trailers (apply 'max (mapcar 'sartd:trailer-ppu-right-edge trailers)) x1))
  (setq minEquipLeft (if trailers (min x0 0.0 (apply 'min (mapcar 'sartd:trailer-ppu-left-edge trailers))) (min x0 0.0)))
  (setq sideDimX2 (+ (car sideBase) sideRight (* 6.0 gap)))
  (setq endDimX2 (+ (car endBase) y1 700.0 gap))
  (setq extMinX
    (min
      (+ (car planBase) minEquipLeft (- 1200.0))
      (+ (car planBase) x0 (- gap))
      (- groundStart gap)
      (+ (car sideBase) minEquipLeft (- gap))
      (+ (car sideBase) x0 (- gap))))
  (setq extMaxX
    (max
      (+ (car planBase) (max maxTrailerRight x1) (max 6500.0 (* 6.0 gap)))
      sideDimX2
      endDimX2
      endGroundEnd
      (+ (car endBase) y1 (* 2.0 gap))
      (+ (car sideBase) sideRight (* 6.0 gap))))
  (setq extMinY
    (min
      (+ (cadr planBase) planBottomY (- (* 3.8 gap)))
      (- (cadr sideBase) (* 3.5 gap))
      (- (cadr endBase) (* 2.2 gap))))
  (setq extMaxY
    (max
      (+ (cadr sideBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr endBase) loadTop topOff (sartd:auto-title-clearance) (* 0.5 gap))
      (+ (cadr planBase) planTopY topOff (sartd:auto-title-clearance) (* 0.5 gap))))
  (sartd:save-extents (list extMinX extMinY) (list extMaxX extMaxY))
  (sartd:v62-apply-draw-order)
  (sartd:pr (strcat "Arrangement drawn in ModelSpace with v67 protected view envelopes and cargo reference extremes: X0="
                    (sartd:fmt0 x0) "mm, Y0=" (sartd:fmt0 y0) "mm.")))


(defun c:SARTDRUN ()
  (sartd:v50-clear-scale-cache)
  (sartd:v59-run-workflow)
  (sartd:v64-apply-draw-order)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v67 applies protected view-envelope spacing so dimensions/text from one view do not overlap other views."))
(princ)


; =================================================================================================
; v0.9.9.4.3.68 PAPERSPACE SCREEN RECENTRE / ANTI-BOTTOM-LEFT VIEW
; - Keeps the drawing sheet centred in the visible AutoCAD screen after layout import, viewport scaling,
;   border update, and final regeneration.
; - This changes only the user's current paper-space view, not the drawing geometry, viewport rectangle,
;   viewport scale, model extents, or title block data.
; =================================================================================================

(setq sartd:*version* "0.9.9.4.3.68")

(defun sartd:v68-paper-bbox (/ ps obj mn mx pmin pmax minx miny maxx maxy got r)
  (vl-load-com)
  (setq ps (sartd:paperspace))
  (setq got nil)
  (vlax-for obj ps
    (setq r (vl-catch-all-apply
              (function
                (lambda ()
                  (vla-GetBoundingBox obj 'mn 'mx)))))
    (if (not (vl-catch-all-error-p r))
      (progn
        (setq pmin (vlax-safearray->list mn))
        (setq pmax (vlax-safearray->list mx))
        (if (and pmin pmax
                 (numberp (car pmin)) (numberp (cadr pmin))
                 (numberp (car pmax)) (numberp (cadr pmax)))
          (if got
            (progn
              (setq minx (min minx (car pmin)))
              (setq miny (min miny (cadr pmin)))
              (setq maxx (max maxx (car pmax)))
              (setq maxy (max maxy (cadr pmax))))
            (progn
              (setq minx (car pmin))
              (setq miny (cadr pmin))
              (setq maxx (car pmax))
              (setq maxy (cadr pmax))
              (setq got T)))))))
  (if got (list minx miny maxx maxy) nil))

(defun sartd:v68-center-current-paper-layout-view (label / doc app box cx cy bw bh scr aspect viewH oldcmdecho zr)
  ; Centre the current PaperSpace sheet on screen without changing drawing objects.
  ; Uses PaperSpace object extents rather than model extents, so the border/layout should not sit
  ; down in the bottom-left of the AutoCAD window after SARTDRUN finishes or moves between stages.
  (vl-load-com)
  (if (= (getvar "TILEMODE") 0)
    (progn
      (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
      (setq app (vlax-get-acad-object))
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
      (setq box (sartd:v68-paper-bbox))
      (if box
        (progn
          (setq cx (/ (+ (nth 0 box) (nth 2 box)) 2.0))
          (setq cy (/ (+ (nth 1 box) (nth 3 box)) 2.0))
          (setq bw (max 1.0 (- (nth 2 box) (nth 0 box))))
          (setq bh (max 1.0 (- (nth 3 box) (nth 1 box))))
          (setq scr (vl-catch-all-apply 'getvar (list "SCREENSIZE")))
          (setq aspect
            (if (and (not (vl-catch-all-error-p scr))
                     (listp scr) (> (cadr scr) 0.0))
              (/ (float (car scr)) (float (cadr scr)))
              1.6))
          ; View height must satisfy both paper height and paper width/screen-aspect.
          (setq viewH (* 1.18 (max bh (/ bw aspect))))
          (setq zr (vl-catch-all-apply 'vla-ZoomCenter (list app (sartd:pt cx cy 0.0) viewH)))
          (if (vl-catch-all-error-p zr)
            (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_C" (list cx cy 0.0) viewH))))
        (vl-catch-all-apply 'vla-ZoomExtents (list app)))
      (if oldcmdecho (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho)))
      (if label (sartd:pr (strcat label ": PaperSpace sheet view centred on screen.")))
      T)
    nil))

(defun sartd:v68-centre-last-layout (label / layoutName)
  (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
  (if (and layoutName (/= layoutName "") (/= (strcase layoutName) "MODEL"))
    (progn
      (sartd:activate-paper-layout layoutName)
      (sartd:v68-center-current-paper-layout-view label))))

(defun sartd:v68-run-workflow (/ oldauto oldcmdecho oldregen ok layoutName source)
  (vl-load-com)
  (sartd:v59-kill-old-public-commands)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDRUN centred-screen workflow."))
  (setq source (sartd:v59-select-excel-source))
  (if (not source)
    (progn
      (sartd:pr "SARTDRUN stopped before drawing because no Excel source was selected.")
      nil)
    (progn
      (sartd:pr (strcat "Excel source locked for this run: " sartd:*v59-excel-source-label*))
      (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
      (setq oldcmdecho (getvar "CMDECHO"))
      (setq oldregen (getvar "REGENAUTO"))
      (sartd:setvar-safe "CMDECHO" 0)
      (sartd:setvar-safe "REGENAUTO" 0)
      (setq sartd:*auto-excel-source* source)
      (setq ok T)

      (sartd:pr "1/6 Draw model from selected Excel source at 0,0.")
      (setq ok (sartd:safe-stage "1/6 ModelSpace draw" 'sartd:run-model-auto-active))

      (if ok
        (progn
          (sartd:pr "2/6 Import selected PaperSpace sheet from block library.")
          (setq ok (sartd:safe-stage "2/6 PaperSpace sheet import" 'sartd:run-paper-auto-active))
          (if ok (sartd:v68-centre-last-layout "2/6 After sheet import"))))

      (if ok
        (progn
          (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:v68-center-current-paper-layout-view "3/6 Before viewport scale")
          (sartd:pr "3/6 Auto-space views, run viewport ZOOM All, then apply nearest safe existing viewport scale.")
          (setq ok (sartd:safe-stage "3/6 Auto-space and viewport scale" 'sartd:run-autofit))
          (if ok (sartd:v68-centre-last-layout "3/6 After viewport scale"))))

      (if ok
        (progn
          (sartd:pr "4/6 Confirm final viewport scale for dims/blocks/border.")
          (setq ok (sartd:safe-stage "4/6 Final viewport scale diagnostics" 'sartd:post-autofit-diagnostics))
          (if ok (sartd:v68-centre-last-layout "4/6 After scale diagnostics"))))

      (if ok
        (progn
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:v68-center-current-paper-layout-view "5/6 Before border update")
          (sartd:pr "5/6 Update selected border/title block attributes.")
          (setq ok (sartd:safe-stage "5/6 Border/title block update" 'sartd:run-border-auto-active))
          (if ok (sartd:v68-centre-last-layout "5/6 After border update"))))

      (if ok
        (progn
          (vl-catch-all-apply 'sartd:deactivate-viewport-to-paperspace '())
          (vl-catch-all-apply 'sartd:go-paperspace '())
          (vl-catch-all-apply 'vla-Regen (list (vla-get-ActiveDocument (vlax-get-acad-object)) 1))
          (sartd:pr "6/6 PaperSpace restored and drawing regenerated.")
          (sartd:v51-force-border-scale-final "SARTDRUN final end-check")
          (sartd:v68-centre-last-layout "6/6 Final screen centre")))

      (if oldregen (sartd:setvar-safe "REGENAUTO" oldregen) (sartd:setvar-safe "REGENAUTO" 1))
      (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
      (setq sartd:*auto-excel-source* oldauto)
      (if ok
        (sartd:pr "SARTDRUN complete.")
        (sartd:pr "SARTDRUN stopped before completion. Check the last numbered stage above."))
      ok)))

(defun c:SARTDRUN ()
  (sartd:v50-clear-scale-cache)
  (sartd:v68-run-workflow)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v68 keeps the PaperSpace sheet centred on screen during and after the run."))
(princ)


; =================================================================================================
; v0.9.9.4.3.69 PAPERSPACE VIEW LOCK / FIT SCREEN
; - Keep the user in the selected PaperSpace layout after each major stage where possible.
; - Do not move any PaperSpace/layout geometry; only reset the AutoCAD display view.
; - Force CVPORT/PSPACE before fitting the sheet, so the zoom is applied to the layout view and not inside the viewport.
; - Use ZOOM Window around the PaperSpace sheet extents so the border fills the available screen instead of sitting bottom-left.
; =================================================================================================
(setq sartd:*version* "0.9.9.4.3.69")

(defun sartd:v69-force-paper-view-state (/ doc)
  (vl-load-com)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (vl-catch-all-apply 'vla-put-MSpace (list doc :vlax-false))
  (if (= (getvar "TILEMODE") 1)
    (vl-catch-all-apply 'setvar (list "TILEMODE" 0)))
  (vl-catch-all-apply 'setvar (list "CVPORT" 1))
  (vl-catch-all-apply 'vl-cmdf (list "_.PSPACE"))
  T)

(defun sartd:v69-paper-bbox-clean (/ ps obj mn mx pmin pmax minx miny maxx maxy got r objname layer)
  ; PaperSpace extents for the active layout. Viewports are included because their boundary is part of the sheet fit.
  ; Proxy/invalid objects are skipped rather than letting GetBoundingBox cancel the run.
  (vl-load-com)
  (setq ps (sartd:paperspace))
  (setq got nil)
  (vlax-for obj ps
    (setq objname (strcase (vlax-get-property obj 'ObjectName)))
    (setq layer (if (vlax-property-available-p obj 'Layer) (strcase (sartd:str (vlax-get obj 'Layer))) ""))
    ; Ignore known non-geometry helper/null objects if any appear.
    (if (not (member objname '("ACDBDICTIONARY" "ACDBXRECORD")))
      (progn
        (setq r (vl-catch-all-apply
                  (function
                    (lambda ()
                      (vla-GetBoundingBox obj 'mn 'mx)))))
        (if (not (vl-catch-all-error-p r))
          (progn
            (setq pmin (vlax-safearray->list mn))
            (setq pmax (vlax-safearray->list mx))
            (if (and pmin pmax
                     (numberp (car pmin)) (numberp (cadr pmin))
                     (numberp (car pmax)) (numberp (cadr pmax))
                     (> (abs (- (car pmax) (car pmin))) 0.001)
                     (> (abs (- (cadr pmax) (cadr pmin))) 0.001))
              (if got
                (progn
                  (setq minx (min minx (car pmin)))
                  (setq miny (min miny (cadr pmin)))
                  (setq maxx (max maxx (car pmax)))
                  (setq maxy (max maxy (cadr pmax))))
                (progn
                  (setq minx (car pmin))
                  (setq miny (cadr pmin))
                  (setq maxx (car pmax))
                  (setq maxy (cadr pmax))
                  (setq got T)))))))))
  (if got (list minx miny maxx maxy) nil))

(defun sartd:v69-fit-current-paper-layout-view (label / oldcmdecho box minx miny maxx maxy bw bh padX padY p1 p2 zr)
  ; Fit the current PaperSpace sheet to the full available screen.
  ; This does NOT move the border/layout/viewport; it only changes the displayed view in PaperSpace.
  (vl-load-com)
  (if (= (getvar "TILEMODE") 0)
    (progn
      (setq oldcmdecho (getvar "CMDECHO"))
      (vl-catch-all-apply 'setvar (list "CMDECHO" 0))
      (sartd:v69-force-paper-view-state)
      (setq box (sartd:v69-paper-bbox-clean))
      (if (not box) (setq box (sartd:v68-paper-bbox)))
      (if box
        (progn
          (setq minx (nth 0 box)
                miny (nth 1 box)
                maxx (nth 2 box)
                maxy (nth 3 box))
          (setq bw (max 1.0 (- maxx minx)))
          (setq bh (max 1.0 (- maxy miny)))
          ; Tight enough to fill the screen but with enough safety that the sheet border is not clipped.
          (setq padX (max (* bw 0.025) 5.0))
          (setq padY (max (* bh 0.025) 5.0))
          (setq p1 (list (- minx padX) (- miny padY) 0.0))
          (setq p2 (list (+ maxx padX) (+ maxy padY) 0.0))
          (setq zr (vl-catch-all-apply 'vl-cmdf (list "_.ZOOM" "_W" p1 p2)))
          (if (vl-catch-all-error-p zr)
            (vl-catch-all-apply 'vla-ZoomExtents (list (vlax-get-acad-object)))))
        (vl-catch-all-apply 'vla-ZoomExtents (list (vlax-get-acad-object))))
      (sartd:v69-force-paper-view-state)
      (if oldcmdecho (vl-catch-all-apply 'setvar (list "CMDECHO" oldcmdecho)))
      (if label (sartd:pr (strcat label ": PaperSpace sheet fitted to screen; layout geometry unchanged.")))
      T)
    nil))

(defun sartd:v69-fit-last-layout-view (label / layoutName)
  (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
  (if (and layoutName (/= layoutName "") (/= (strcase layoutName) "MODEL"))
    (progn
      (sartd:activate-paper-layout layoutName)
      (sartd:v69-fit-current-paper-layout-view label))))

(defun sartd:v69-run-workflow (/ oldauto oldcmdecho oldregen ok layoutName source)
  (vl-load-com)
  (sartd:v59-kill-old-public-commands)
  (sartd:pr (strcat "RUNNING SARENS_TRAILERDRAFTSMAN v" sartd:*version* " - SARTDRUN PaperSpace-fit workflow."))
  (setq source (sartd:v59-select-excel-source))
  (if (not source)
    (progn
      (sartd:pr "SARTDRUN stopped before drawing because no Excel source was selected.")
      nil)
    (progn
      (sartd:pr (strcat "Excel source locked for this run: " sartd:*v59-excel-source-label*))
      (setq oldauto (if (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source* nil))
      (setq oldcmdecho (getvar "CMDECHO"))
      (setq oldregen (getvar "REGENAUTO"))
      (sartd:setvar-safe "CMDECHO" 0)
      (sartd:setvar-safe "REGENAUTO" 0)
      (setq sartd:*auto-excel-source* source)
      (setq ok T)

      (sartd:pr "1/6 Draw model from selected Excel source at 0,0.")
      (setq ok (sartd:safe-stage "1/6 ModelSpace draw" 'sartd:run-model-auto-active))

      (if ok
        (progn
          (sartd:pr "2/6 Import selected PaperSpace sheet from block library.")
          (setq ok (sartd:safe-stage "2/6 PaperSpace sheet import" 'sartd:run-paper-auto-active))
          (if ok (sartd:v69-fit-last-layout-view "2/6 After sheet import"))))

      (if ok
        (progn
          (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:v69-fit-current-paper-layout-view "3/6 Before viewport scale")
          (sartd:pr "3/6 Auto-space views, run viewport ZOOM All, then apply nearest safe existing viewport scale.")
          (setq ok (sartd:safe-stage "3/6 Auto-space and viewport scale" 'sartd:run-autofit))
          (if ok (sartd:v69-fit-last-layout-view "3/6 After viewport scale"))))

      (if ok
        (progn
          (sartd:pr "4/6 Confirm final viewport scale for dims/blocks/border.")
          (setq ok (sartd:safe-stage "4/6 Final viewport scale diagnostics" 'sartd:post-autofit-diagnostics))
          (if ok (sartd:v69-fit-last-layout-view "4/6 After scale diagnostics"))))

      (if ok
        (progn
          (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:v69-fit-current-paper-layout-view "5/6 Before border update")
          (sartd:pr "5/6 Update selected border/title block attributes.")
          (setq ok (sartd:safe-stage "5/6 Border/title block update" 'sartd:run-border-auto-active))
          (if ok (sartd:v69-fit-last-layout-view "5/6 After border update"))))

      (if ok
        (progn
          (setq layoutName (getenv "SARTD_LAST_LAYOUT"))
          (if (and layoutName (/= layoutName ""))
            (sartd:activate-paper-layout layoutName))
          (sartd:v69-force-paper-view-state)
          (vl-catch-all-apply 'vla-Regen (list (vla-get-ActiveDocument (vlax-get-acad-object)) 1))
          (sartd:pr "6/6 PaperSpace restored and drawing regenerated.")
          (sartd:v51-force-border-scale-final "SARTDRUN final end-check")
          (sartd:v69-fit-last-layout-view "6/6 Final PaperSpace fit")))

      (if oldregen (sartd:setvar-safe "REGENAUTO" oldregen) (sartd:setvar-safe "REGENAUTO" 1))
      (if oldcmdecho (sartd:setvar-safe "CMDECHO" oldcmdecho))
      (setq sartd:*auto-excel-source* oldauto)
      (if ok
        (sartd:pr "SARTDRUN complete. PaperSpace sheet remains fitted to screen.")
        (sartd:pr "SARTDRUN stopped before completion. Check the last numbered stage above."))
      ok)))

(defun c:SARTDRUN ()
  (sartd:v50-clear-scale-cache)
  (sartd:v69-run-workflow)
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " loaded."
    " Command: SARTDRUN only."
    " v69 keeps AutoCAD in PaperSpace where possible and fits the sheet to the full available screen without moving layout geometry."))
(princ)


; =================================================================================================
; v1.0 FULL RELEASE / AUTOCAD BLOCKS FOLDER DISCOVERY
; - Final public release version string.
; - Looks for the bundled Autocad Blocks folder beside this LSP before asking the user.
; - If the unified block library cannot be found, asks the user for the Autocad Blocks folder first.
; - Stores both SARTD_BLOCKS_FOLDER and SARTD_LIBRARY_DWG after a successful selection.
; =================================================================================================
(setq sartd:*version* "1.0")
(setq sartd:*release-file* "SARENS_TRAILERDRAFTSMAN_v1.1.lsp")
(setq sartd:*blocks-folder-env* "SARTD_BLOCKS_FOLDER")
(setq sartd:*blocks-folder-default-name* "Autocad Blocks")

(defun sartd:v100-trim-folder (folder / f)
  (setq f (sartd:str folder))
  (vl-string-right-trim "\\/" f))

(defun sartd:v100-path-join (folder file / f)
  (setq f (sartd:v100-trim-folder folder))
  (if (= f "") file (strcat f "\\" file)))

(defun sartd:v100-file-exists-p (path)
  (and path (/= path "") (findfile path)))

(defun sartd:v100-dir-exists-p (path)
  (and path (/= path "") (vl-file-directory-p path)))

(defun sartd:v100-release-object (obj)
  (if (and obj (not (vl-catch-all-error-p obj)))
    (vl-catch-all-apply 'vlax-release-object (list obj)))
  nil)

(defun sartd:v100-library-in-folder (folder / path)
  (setq path (sartd:v100-path-join folder sartd:*library-default-name*))
  (if (sartd:v100-file-exists-p path) (findfile path) nil))

(defun sartd:v100-store-library-path (path / full folder root)
  (setq full (if (sartd:v100-file-exists-p path) (findfile path) path))
  (if (and full (/= full ""))
    (progn
      (setenv sartd:*library-env* full)
      (setq folder (vl-filename-directory full))
      (if folder (setenv sartd:*blocks-folder-env* folder))
      (if folder
        (progn
          (setq root (vl-filename-directory folder))
          (if root (setenv "SARTD_LSP_FOLDER" root))))
      full)
    nil))

(defun sartd:v100-loaded-file-folder (/ p)
  (cond
    ((and (boundp '*load-truename*) *load-truename*)
      (vl-filename-directory (sartd:str *load-truename*)))
    ((and (boundp '*load-pathname*) *load-pathname*)
      (vl-filename-directory (sartd:str *load-pathname*)))
    ((setq p (findfile sartd:*release-file*))
      (vl-filename-directory p))
    (T nil)))

(defun sartd:v100-bundled-blocks-folder (/ root folder)
  (setq root (sartd:v100-loaded-file-folder))
  (if root
    (progn
      (setq folder (sartd:v100-path-join root sartd:*blocks-folder-default-name*))
      (if (sartd:v100-dir-exists-p folder) folder nil))
    nil))

(defun sartd:v100-default-blocks-folder (/ folder)
  (cond
    ((and (setq folder (getenv sartd:*blocks-folder-env*))
          (/= folder "")
          (sartd:v100-dir-exists-p folder))
      folder)
    ((sartd:v100-bundled-blocks-folder))
    (T nil)))

(defun sartd:v100-browse-blocks-folder (/ sh folder self path default)
  (vl-load-com)
  (setq default (sartd:v100-default-blocks-folder))
  (setq sh (vl-catch-all-apply 'vlax-create-object (list "Shell.Application")))
  (if (not (vl-catch-all-error-p sh))
    (progn
      (setq folder
        (vl-catch-all-apply
          'vlax-invoke-method
          (list sh 'BrowseForFolder 0
                (strcat "Select the " sartd:*blocks-folder-default-name*
                        " folder containing " sartd:*library-default-name*)
                0
                (if default default 0))))
      (if (vl-catch-all-error-p folder)
        (setq folder
          (vl-catch-all-apply
            'vlax-invoke-method
            (list sh 'BrowseForFolder 0
                  (strcat "Select the " sartd:*blocks-folder-default-name*
                          " folder containing " sartd:*library-default-name*)
                  0))))
      (if (not (vl-catch-all-error-p folder))
        (progn
          (setq self (vl-catch-all-apply 'vlax-get-property (list folder 'Self)))
          (if (not (vl-catch-all-error-p self))
            (progn
              (setq path (vl-catch-all-apply 'vlax-get-property (list self 'Path)))
              (if (vl-catch-all-error-p path) (setq path nil)))))
        (setq path nil))
      (sartd:v100-release-object self)
      (sartd:v100-release-object folder)
      (sartd:v100-release-object sh)
      path)
    nil))

(defun sartd:v100-dialog-default-library (/ folder path)
  (cond
    ((and (setq folder (sartd:v100-default-blocks-folder))
          (setq path (sartd:v100-path-join folder sartd:*library-default-name*)))
      path)
    ((and (setq path (getenv sartd:*library-env*)) (/= path ""))
      path)
    (T sartd:*library-default-name*)))

(defun sartd:v100-prompt-library-dwg (/ path)
  (setq path
    (getfiled
      "Select SARENS Trailer Draftsman block library DWG"
      (sartd:v100-dialog-default-library)
      "dwg"
      0))
  (if (and path (/= path ""))
    (sartd:v100-store-library-path path)
    nil))

(defun sartd:v100-prompt-blocks-folder-or-dwg (/ folder path)
  (princ
    (strcat
      "\nSARENS Trailer Draftsman cannot find " sartd:*library-default-name* "."
      "\nPlease select the " sartd:*blocks-folder-default-name* " folder when prompted."))
  (setq folder (sartd:v100-browse-blocks-folder))
  (cond
    ((and folder (/= folder "") (setq path (sartd:v100-library-in-folder folder)))
      (setenv sartd:*blocks-folder-env* (sartd:v100-trim-folder folder))
      (sartd:v100-store-library-path path))
    ((and folder (/= folder ""))
      (sartd:pr
        (strcat
          "Selected folder does not contain " sartd:*library-default-name*
          ". Select the library DWG directly."))
      (sartd:v100-prompt-library-dwg))
    (T
      (sartd:pr "Blocks folder selection cancelled or unavailable. Select the library DWG directly.")
      (sartd:v100-prompt-library-dwg))))

(defun sartd:get-library-path (/ path folder)
  (cond
    ((and (setq path (getenv sartd:*library-env*))
          (/= path "")
          (sartd:v100-file-exists-p path))
      (sartd:v100-store-library-path path))
    ((and (setq folder (getenv sartd:*blocks-folder-env*))
          (/= folder "")
          (setq path (sartd:v100-library-in-folder folder)))
      (sartd:v100-store-library-path path))
    ((and (setq folder (sartd:v100-bundled-blocks-folder))
          (setq path (sartd:v100-library-in-folder folder)))
      (sartd:v100-store-library-path path))
    ((setq path (findfile sartd:*library-default-name*))
      (sartd:v100-store-library-path path))
    (T
      (sartd:v100-prompt-blocks-folder-or-dwg))))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " full release loaded."
    " Commands: SARTDRUN, SARTDWEB, SARTDJSON and SARTDJSONDATA."
    " If the block library cannot be found, the program now asks for the Autocad Blocks folder."))
(princ)

; =================================================================================================
; WEBSITE TRANSFER HANDOFF
; SARTDWEB imports the workbook exported by the Trailer Stability web application.
; The website uses the transfer code in the filename:
;   SARENS_AUTOCAD_<code>.xlsm
; =================================================================================================
(defun sartd:v100-download-folder (/ user folder)
  (setq folder (getenv "SARTD_DOWNLOAD_FOLDER"))
  (if (and folder (/= folder ""))
    folder
    (progn
      (setq user (getenv "USERPROFILE"))
      (if (and user (/= user ""))
        (strcat user "\\Downloads")
        ""))))

(defun sartd:v100-find-transfer-workbook (code / folder files path)
  (setq folder (sartd:v100-download-folder))
  (if (and folder (/= folder ""))
    (progn
      (setq files
        (vl-catch-all-apply
          'vl-directory-files
          (list folder (strcat "SARENS_AUTOCAD_" code "*.xlsm") 1)))
      (if (and files (not (vl-catch-all-error-p files)) (car files))
        (setq path (strcat folder "\\" (car files)))))
    nil)
  (if (and path (findfile path)) path nil))

(defun c:SARTDWEB (/ code path oldpath oldcode result)
  (vl-load-com)
  (setq code (getstring T "\nEnter website transfer code: "))
  (if code (setq code (vl-string-trim " \t\r\n" code)) (setq code ""))
  (cond
    ((= code "")
      (sartd:pr "No transfer code entered. SARTDWEB stopped."))
    ((not (setq path (sartd:v100-find-transfer-workbook code)))
      (sartd:pr
        (strcat
          "No matching SARENS_AUTOCAD_" code ".xlsm was found in the Downloads folder. "
          "Download the website export first, or set SARTD_DOWNLOAD_FOLDER to the exchange folder.")))
    (T
      (setq oldpath sartd:*web-workbook-path*)
      (setq oldcode sartd:*web-transfer-code*)
      (setq sartd:*web-workbook-path* path)
      (setq sartd:*web-transfer-code* code)
      (setenv "SARTD_LAST_XLS" path)
      (sartd:pr (strcat "Website transfer located: " path))
      (setq result (vl-catch-all-apply 'sartd:v69-run-workflow nil))
      (if (vl-catch-all-error-p result)
        (sartd:pr (strcat "SARTDWEB failed: " (vl-catch-all-error-message result)))
        (sartd:pr "SARTDWEB complete."))
      (setq sartd:*web-workbook-path* oldpath)
      (setq sartd:*web-transfer-code* oldcode)))
  (princ))

(princ "\nSARTDWEB ready. Enter the code shown by Export to AutoCAD.")
(princ)

; =================================================================================================
; v1.17 INTERACTIVE JSON SELECTION HELPERS
; - SARTDJSON always asks for the numbered case-data JSON. It never honours the automated-test flag.
; - SARTDJSONDATA deliberately revalidates the last selected case without opening a dialog.
; - The separate key/contract JSON is identified explicitly and cannot be mistaken for case data.
; Final command overrides are installed after the v1.16 compatibility section at the end of file.
; =================================================================================================

(defun sartd:v117-json-key-envelope-p (root)
  (and (sartd:json-object-p root)
       (= (sartd:json-string (sartd:json-get root "format")) sartd:*json-format*)
       (= (sartd:json-string (sartd:json-get root "keyId")) sartd:*json-key-id*)
       (sartd:json-get root "sections")
       (not (sartd:json-object-p (sartd:json-get root "data")))))

(defun sartd:v117-json-key-filename-p (path / base)
  (setq base (if path (strcase (vl-filename-base path)) ""))
  (or (wcmatch base "*AUTOCAD*KEY*")
      (wcmatch base "*CAD*KEY*")))

(defun sartd:v117-downloads-folder (/ user path)
  (setq user (getenv "USERPROFILE"))
  (if user
    (progn
      (setq path (strcat user "\\Downloads\\"))
      (if (vl-file-directory-p path) path ""))
    ""))

(defun sartd:v117-json-dialog-default (/ last)
  (setq last (getenv "SARTD_JSON_LAST"))
  (if (and last (/= last "") (findfile last)
           (not (sartd:v117-json-key-filename-p last))
           (not (wcmatch (strcase last) "*TEST-FIXTURES*")))
    last
    (sartd:v117-downloads-folder)))

(defun sartd:v117-json-prompt-source-path (/ default path done)
  (setq default (sartd:v117-json-dialog-default) path nil done nil)
  (while (not done)
    (setq path
      (getfiled
        "Select numbered Trailer Stability case JSON (not the key file)"
        default
        "json"
        0))
    (cond
      ((not path)
        (setq done T))
      ((sartd:v117-json-key-filename-p path)
        (sartd:pr
          "That is the AutoCAD key/contract file. Keep it with the package, then select the numbered case-data JSON, for example trailer-stability-autocad-581669.json.")
        (setq default path path nil))
      (T
        (setq done T))))
  path)

(defun sartd:v117-json-last-source-path (/ path)
  (setq path (getenv "SARTD_JSON_LAST"))
  (cond
    ((or (not path) (= path ""))
      (sartd:pr "No previous case-data JSON is stored. Run SARTDJSON and select the numbered case file first.")
      nil)
    ((sartd:v117-json-key-filename-p path)
      (sartd:pr "The remembered JSON is the key/contract file, not case data. Run SARTDJSON and select the numbered case file.")
      nil)
    ((not (findfile path))
      (sartd:pr (strcat "The previous case-data JSON no longer exists: " path ". Run SARTDJSON to select it again."))
      nil)
    (T path)))

(defun sartd:json-load-validated (path / root verdict)
  (setq sartd:*json-source* path sartd:*json-log* (strcat path ".lisp.log"))
  (setq root (sartd:json-read-text path))
  (cond
    ((not root)
      (sartd:json-log (if sartd:*json-error* sartd:*json-error* "JSON parse failed."))
      nil)
    ((sartd:v117-json-key-envelope-p root)
      (sartd:json-log
        "This is the AutoCAD key/contract JSON, not a drawing case. Select the numbered trailer-stability-autocad-######.json case-data file instead.")
      nil)
    ((sartd:v116-saved-project-json-p root)
      (sartd:json-log
        "This is a saved project JSON, not the coded AutoCAD drawing export. In Trailer Stability use AutoCAD > Export drawing data, then select the numbered TRAILER-STABILITY-CAD-DATA JSON file.")
      nil)
    (T
      (setq verdict (sartd:json-validate root))
      (if (not (car verdict))
        (progn (foreach e (cadr verdict) (sartd:json-log e)) nil)
        (progn
          (setenv "SARTD_JSON_LAST" path)
          (setq sartd:*json-root* root sartd:*json-data* (sartd:json-adapt root))
          (sartd:json-log
            (strcat "Validated numbered case export: "
                    (itoa (length (sartd:g 'trailers sartd:*json-data*))) " trailer(s), "
                    (itoa (length (sartd:g 'hydraulic-grouping sartd:*json-data*))) " hydraulic side definition(s), "
                    (itoa (length (sartd:g 'json-polygon sartd:*json-data*))) " stability-boundary point(s)."))
          sartd:*json-data*)))))

(defun c:SARTDJSONDATA (/ path data)
  (vl-load-com)
  (setq path (sartd:v117-json-last-source-path))
  (if path
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn (sartd:json-summary data) (sartd:json-log "SARTDJSONDATA complete."))
        (sartd:json-log "SARTDJSONDATA stopped before drawing."))))
  (princ))

(defun c:SARTDJSON (/ path data result)
  (vl-load-com)
  ; Interactive command behavior is unconditional. Automated validation uses SARTDJSONDATA.
  (setq path (sartd:v117-json-prompt-source-path))
  (if (and path (/= path ""))
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn
          (sartd:json-summary data)
          (setq result (vl-catch-all-apply 'sartd:json-run-drawing (list data)))
          (if (vl-catch-all-error-p result)
            (sartd:json-log (strcat "SARTDJSON failed safely: " (vl-catch-all-error-message result)))
            (if result
              (sartd:json-log "SARTDJSON complete.")
              (sartd:json-log "SARTDJSON stopped; no drawing was committed."))))
        (sartd:json-log "SARTDJSON stopped before drawing.")))
    (sartd:pr "No numbered case-data JSON was selected; SARTDJSON stopped."))
  (princ))

; =================================================================================================
; JSON WEB EXPORT PATH (v1.2)
; -------------------------------------------------------------------------------------------------
; This section is deliberately independent from the workbook/Excel transfer path above.  JSON
; commands never call sartd:read-data, never acquire an Excel COM object, and only mutate the
; drawing after the complete envelope has parsed and passed validation.
;
; JSON coordinates are metres from the case datum.  The existing SARTD geometry routines use mm,
; so the adapter converts lengths/positions exactly once.  X increases from rear (lower X) to
; front (higher X); Y keeps the web engine's signed transverse convention.
; =================================================================================================

(setq sartd:*json-format* "TRAILER-STABILITY-CAD-DATA")
(setq sartd:*json-version* 1)
(setq sartd:*json-key-id* "TS-CAD-KEY-1")
(setq sartd:*json-text* nil)
(setq sartd:*json-pos* 0)
(setq sartd:*json-len* 0)
(setq sartd:*json-error* nil)
(setq sartd:*json-source* nil)
(setq sartd:*json-log* nil)
(setq sartd:*json-root* nil)
(setq sartd:*json-data* nil)

(defun sartd:json-error (msg)
  (if (not sartd:*json-error*) (setq sartd:*json-error* msg))
  nil)

(defun sartd:json-peek ()
  (if (and sartd:*json-text* (< sartd:*json-pos* sartd:*json-len*))
    (substr sartd:*json-text* (1+ sartd:*json-pos*) 1)
    nil))

(defun sartd:json-take (/ ch)
  (setq ch (sartd:json-peek))
  (if ch (setq sartd:*json-pos* (1+ sartd:*json-pos*)))
  ch)

(defun sartd:json-ws-p (ch)
  (and ch (or (= ch " ") (= ch "\t") (= ch "\r") (= ch "\n"))))

(defun sartd:json-skip-ws ()
  (while (sartd:json-ws-p (sartd:json-peek)) (sartd:json-take))
  T)

(defun sartd:json-hex-value (ch / code)
  (setq code (ascii (strcase ch)))
  (cond
    ((and (>= code 48) (<= code 57)) (- code 48))
    ((and (>= code 65) (<= code 70)) (+ 10 (- code 65)))
    (T nil)))

(defun sartd:json-hex4 (/ i ch n v)
  (setq i 0 n 0)
  (while (< i 4)
    (setq ch (sartd:json-take))
    (setq v (if ch (sartd:json-hex-value ch) nil))
    (if (null v)
      (setq i 4 n nil)
      (progn (setq n (+ (* n 16) v)) (setq i (1+ i)))))
  n)

(defun sartd:json-string-raw (/ out ch esc code done)
  (if (/= (sartd:json-take) "\"")
    (sartd:json-error "Expected JSON string opening quote.")
    (progn
      (setq out "" done nil)
      (while (and (not done) (not sartd:*json-error*))
        (setq ch (sartd:json-take))
        (cond
          ((null ch) (sartd:json-error "Unterminated JSON string."))
          ((= ch "\"") (setq done T))
          ((= ch "\\")
            (setq esc (sartd:json-take))
            (cond
              ((= esc "\"") (setq out (strcat out "\"")))
              ((= esc "\\") (setq out (strcat out "\\")))
              ((= esc "/") (setq out (strcat out "/")))
              ((= esc "b") (setq out (strcat out (chr 8))))
              ((= esc "f") (setq out (strcat out (chr 12))))
              ((= esc "n") (setq out (strcat out (chr 10))))
              ((= esc "r") (setq out (strcat out (chr 13))))
              ((= esc "t") (setq out (strcat out (chr 9))))
              ((= esc "u")
                (setq code (sartd:json-hex4))
                (if code (setq out (strcat out (chr code)))
                  (sartd:json-error "Invalid JSON unicode escape.")))
              (T (sartd:json-error "Invalid JSON string escape."))))
          (T (setq out (strcat out ch))))
      (if done out nil)))))

(defun sartd:json-number-valid-p (s / n i ch state digit)
  ; Strict JSON number grammar: -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
  (setq n (strlen s) i 1 state 0 digit nil)
  (if (= n 0) nil
    (progn
      (if (= (substr s i 1) "-") (setq i 2))
      (if (> i n) nil
        (progn
          (setq ch (substr s i 1))
          (cond
            ((= ch "0") (setq i (1+ i)))
            ((and (>= (ascii ch) 49) (<= (ascii ch) 57))
              (while (and (<= i n) (setq ch (substr s i 1))
                           (>= (ascii ch) 48) (<= (ascii ch) 57))
                (setq i (1+ i))))
            (T (setq i (1+ n))))
          (if (and (<= i n) (= (substr s i 1) "."))
            (progn
              (setq i (1+ i) digit nil)
              (while (and (<= i n) (setq ch (substr s i 1))
                           (>= (ascii ch) 48) (<= (ascii ch) 57))
                (setq digit T i (1+ i)))
              (if (not digit) (setq i (1+ n)))))
          (if (and (<= i n) (or (= (substr s i 1) "e") (= (substr s i 1) "E")))
            (progn
              (setq i (1+ i))
              (if (and (<= i n) (or (= (substr s i 1) "+") (= (substr s i 1) "-")))
                (setq i (1+ i)))
              (setq digit nil)
              (while (and (<= i n) (setq ch (substr s i 1))
                           (>= (ascii ch) 48) (<= (ascii ch) 57))
                (setq digit T i (1+ i)))
              (if (not digit) (setq i (1+ n)))))
          (= i (1+ n)))))))

(defun sartd:json-number (/ start ch token)
  (setq start sartd:*json-pos*)
  (while (and (setq ch (sartd:json-peek))
              (or (= ch "-") (= ch "+") (= ch ".")
                  (= ch "e") (= ch "E")
                  (and (>= (ascii ch) 48) (<= (ascii ch) 57))))
    (sartd:json-take))
  (setq token (substr sartd:*json-text* (1+ start) (- sartd:*json-pos* start)))
  (if (sartd:json-number-valid-p token)
    (cons 'sartd-json-number (atof token))
    (sartd:json-error (strcat "Invalid JSON number: " token))))

(defun sartd:json-literal (word tag value / n actual)
  (setq n (strlen word) actual (substr sartd:*json-text* (1+ sartd:*json-pos*) n))
  (if (= actual word)
    (progn (setq sartd:*json-pos* (+ sartd:*json-pos* n)) (cons tag value))
    (sartd:json-error (strcat "Invalid JSON literal; expected " word "."))))

(defun sartd:json-value (/ ch s)
  (sartd:json-skip-ws)
  (setq ch (sartd:json-peek))
  (cond
    ((null ch) (sartd:json-error "Unexpected end of JSON."))
    ((= ch "{") (sartd:json-object))
    ((= ch "[") (sartd:json-array))
    ((= ch "\"") (cons 'sartd-json-string (sartd:json-string-raw)))
    ((or (= ch "-") (= ch ".") (and (>= (ascii ch) 48) (<= (ascii ch) 57)))
      (sartd:json-number))
    ((= ch "t") (sartd:json-literal "true" 'sartd-json-boolean T))
    ((= ch "f") (sartd:json-literal "false" 'sartd-json-boolean nil))
    ((= ch "n") (sartd:json-literal "null" 'sartd-json-null nil))
    (T (sartd:json-error (strcat "Unexpected JSON token: " ch)))))

(defun sartd:json-object (/ pairs key val sep done)
  (sartd:json-take)
  (sartd:json-skip-ws)
  (setq pairs nil done nil)
  (if (= (sartd:json-peek) "}")
    (progn (sartd:json-take) (setq done T)))
  (while (and (not done) (not sartd:*json-error*))
    (sartd:json-skip-ws)
    (if (/= (sartd:json-peek) "\"")
      (sartd:json-error "JSON object key must be a string.")
      (progn
        (setq key (sartd:json-string-raw))
        (sartd:json-skip-ws)
        (if (/= (sartd:json-take) ":")
          (sartd:json-error "Expected ':' after JSON object key.")
          (setq val (sartd:json-value)))
        (if (not sartd:*json-error*)
          (setq pairs (cons (cons key val) pairs)))))
    (if (not sartd:*json-error*)
      (progn
        (sartd:json-skip-ws)
        (setq sep (sartd:json-peek))
        (cond
          ((= sep "}") (sartd:json-take) (setq done T))
          ((= sep ",") (sartd:json-take))
          (T (sartd:json-error "Expected ',' or '}' in JSON object."))))))
  (if sartd:*json-error* nil (cons 'sartd-json-object (reverse pairs))))

(defun sartd:json-array (/ vals sep done)
  (sartd:json-take)
  (sartd:json-skip-ws)
  (setq vals nil done nil)
  (if (= (sartd:json-peek) "]")
    (progn (sartd:json-take) (setq done T))
    (while (and (not done) (not sartd:*json-error*))
      (setq vals (cons (sartd:json-value) vals))
      (if (not sartd:*json-error*)
        (progn
          (sartd:json-skip-ws)
          (setq sep (sartd:json-take))
          (cond ((= sep "]") (setq done T))
                ((/= sep ",") (sartd:json-error "Expected ',' or ']' in JSON array.")))))))
  (if sartd:*json-error* nil (cons 'sartd-json-array (reverse vals))))

(defun sartd:json-kind (v) (if v (car v) nil))
(defun sartd:json-object-p (v) (eq (sartd:json-kind v) 'sartd-json-object))
(defun sartd:json-array-p (v) (eq (sartd:json-kind v) 'sartd-json-array))
(defun sartd:json-get (obj key / item)
  (if (sartd:json-object-p obj)
    (progn (setq item (assoc key (cdr obj))) (if item (cdr item) nil)) nil))
(defun sartd:json-items (arr) (if (sartd:json-array-p arr) (cdr arr) nil))
(defun sartd:json-string (v / x) (if (eq (sartd:json-kind v) 'sartd-json-string) (cdr v) nil))
(defun sartd:json-number-value (v / x) (if (eq (sartd:json-kind v) 'sartd-json-number) (cdr v) nil))
(defun sartd:json-number-or (v fallback / x) (setq x (sartd:json-number-value v)) (if (numberp x) x fallback))
(defun sartd:json-bool-value (v fallback)
  (cond ((eq (sartd:json-kind v) 'sartd-json-boolean) (cdr v)) (T fallback)))

(defun sartd:json-read-text (path / f line text result)
  (setq text "")
  (setq f (open path "r"))
  (if (not f)
    (sartd:json-error (strcat "Cannot open JSON file: " path))
    (progn
      (while (setq line (read-line f)) (setq text (strcat text line "\n")))
      (close f)
      (setq sartd:*json-text* text sartd:*json-pos* 0 sartd:*json-len* (strlen text)
            sartd:*json-error* nil)
      (setq result (sartd:json-value))
      (sartd:json-skip-ws)
      (if (and result (not sartd:*json-error*) (< sartd:*json-pos* sartd:*json-len*))
        (sartd:json-error "Trailing characters after JSON document."))
      (if sartd:*json-error* nil result))))

(defun sartd:json-log (msg / f)
  (if (and sartd:*json-log* (/= sartd:*json-log* ""))
    (progn
      (setq f (open sartd:*json-log* "a"))
      (if f (progn (write-line (strcat "[SARTDJSON] " msg) f) (close f)))))
  (sartd:pr (strcat "JSON: " msg))
  msg)

(defun sartd:json-required-number (obj key label errors / v x)
  (setq v (sartd:json-get obj key) x (sartd:json-number-value v))
  (if (not (numberp x)) (cons (strcat label " (" key ") must be numeric.") errors) errors))

(defun sartd:json-required-positive (obj key label errors / v x)
  (setq v (sartd:json-get obj key) x (sartd:json-number-value v))
  (if (or (not (numberp x)) (<= x 0.0))
    (cons (strcat label " (" key ") must be greater than zero.") errors)
    errors))

(defun sartd:json-validate (root / errors data cg trs tr r hy poly mode rv rv-item k)
  (setq errors nil)
  (if (not (sartd:json-object-p root))
    (setq errors (cons "Root must be a JSON object." errors)))
  (if (and (sartd:json-object-p root) (/= (sartd:json-string (sartd:json-get root "format")) sartd:*json-format*))
    (setq errors (cons "Unsupported JSON format." errors)))
  (if (and (sartd:json-object-p root) (/= (sartd:json-number-or (sartd:json-get root "version") -1) sartd:*json-version*))
    (setq errors (cons "Unsupported JSON version." errors)))
  (if (and (sartd:json-object-p root) (/= (sartd:json-string (sartd:json-get root "keyId")) sartd:*json-key-id*))
    (setq errors (cons "Unsupported JSON keyId." errors)))
  (setq data (if (sartd:json-object-p root) (sartd:json-get root "data") nil))
  (if (not (sartd:json-object-p data))
    (setq errors (cons "Envelope data object is missing." errors)))
  (setq cg (if data (sartd:json-get data "cg") nil))
  (if (not (sartd:json-object-p cg))
    (setq errors (cons "Cargo object data.cg is missing." errors))
    (foreach k '("x" "y" "z")
      (setq errors (sartd:json-required-number cg k "Cargo" errors))))
  (foreach k '("l" "w" "h" "m")
    (setq errors (sartd:json-required-positive cg k "Cargo" errors)))
  (setq trs (if data (sartd:json-items (sartd:json-get data "tr")) nil))
  (if (not trs)
    (setq errors (cons "At least one active trailer is required." errors))
    (foreach tr trs
      (if (not (sartd:json-object-p tr))
        (setq errors (cons "Each trailer must be an object." errors))
        (progn
          (foreach k '("al" "x" "y")
            (setq errors (sartd:json-required-number tr k "Trailer" errors)))
          (setq errors (sartd:json-required-positive tr "w" "Trailer" errors))
          (if (or (not (sartd:json-string (sartd:json-get tr "id")))
                  (= (sartd:json-string (sartd:json-get tr "id")) ""))
            (setq errors (cons "Trailer id is required." errors)))
          (if (<= (sartd:json-number-or (sartd:json-get tr "al") 0) 0)
            (setq errors (cons "Trailer axle line count must be positive." errors)))))))
  (setq r (if data (sartd:json-get data "r") nil))
  (if (not (sartd:json-object-p r))
    (setq errors (cons "Authoritative result data.r is missing." errors)))
    (progn
      (setq poly (sartd:json-items (sartd:json-get r "pg")))
      (setq hy (sartd:json-get data "hy"))
      (setq mode
        (strcase
          (cond
            ((sartd:json-string hy) (sartd:json-string hy))
            ((sartd:json-object-p hy) (sartd:json-string (sartd:json-get hy "md")))
            (T ""))))
      (if (not poly)
        (setq errors (cons "Authoritative stability polygon data.r.pg is missing." errors))
        (progn
          (if (< (length poly) 3)
            (setq errors (cons "Stability polygon must contain at least three points." errors)))
          (if (and (wcmatch mode "*FOUR*") (< (length poly) 4))
            (setq errors (cons "Four-point hydraulic mode requires four polygon points." errors)))))
      (setq rv (sartd:json-items (sartd:json-get r "rv")))
      (if (not rv)
        (setq errors (cons "Authoritative resolved trailer geometry data.r.rv is missing." errors))
        (progn
          (if (/= (length rv) (length trs))
            (setq errors (cons "Resolved trailer geometry count does not match trailers." errors)))
          (foreach rv-item rv
            (if (not (sartd:json-object-p rv-item))
              (setq errors (cons "Each resolved trailer geometry record must be an object." errors))
              (foreach k '("startXM" "centreYM" "lengthM" "widthM" "ppuLeftLengthM" "ppuRightLengthM")
                (setq errors (sartd:json-required-number rv-item k "Resolved trailer" errors))))))))
  (if errors (list nil (reverse errors)) (list T nil)))

(defun sartd:j-mm (obj key fallback / v)
  (setq v (sartd:json-number-value (sartd:json-get obj key)))
  (if (numberp v) (* 1000.0 v) fallback))

(defun sartd:j-mass (obj key fallback) (sartd:json-number-or (sartd:json-get obj key) fallback))

(defun sartd:json-adapt-trailer (tr resolved index / name ax x y len wid pl pr ppul ppur)
  (setq name (sartd:json-string (sartd:json-get tr "n")))
  (setq ax (fix (sartd:json-number-or (sartd:json-get tr "al") 1)))
  (setq x (sartd:j-mm (if resolved resolved tr) "startXM" (sartd:j-mm tr "x" 0.0)))
  (setq y (sartd:j-mm (if resolved resolved tr) "centreYM" (sartd:j-mm tr "y" 0.0)))
  (setq len (sartd:j-mm (if resolved resolved tr) "lengthM" (sartd:j-mm tr "w" 12000.0)))
  (setq wid (sartd:j-mm (if resolved resolved tr) "widthM" (sartd:j-mm tr "w" 3000.0)))
  (setq pl (sartd:j-mm (if resolved resolved tr) "ppuLeftLengthM" (sartd:j-mm tr "pl" 0.0)))
  (setq pr (sartd:j-mm (if resolved resolved tr) "ppuRightLengthM" (sartd:j-mm tr "fl" 0.0)))
  (setq ppul (sartd:json-bool-value (sartd:json-get tr "rb") nil))
  (setq ppur (sartd:json-bool-value (sartd:json-get tr "ff") nil))
  (list (cons 'row (1+ index)) (cons 'type (if name name "TRAILER")) (cons 'model name)
        (cons 'axles ax) (cons 'x x) (cons 'y y) (cons 'spacing (sartd:j-mm tr "ap" 1400.0))
        (cons 'length len) (cons 'width wid) (cons 'ppu-left ppul) (cons 'ppu-right ppur)
        (cons 'ppu-left-length pl) (cons 'ppu-right-length pr)
        (cons 'ppu-state (cond ((and ppul ppur) "BOTH") (ppul "LEFT") (ppur "RIGHT") (T "NONE")))
        (cons 'ppu-left-weight 0.0) (cons 'ppu-right-weight 0.0) (cons 'self-weight 0.0)
        (cons 'trailer-index (1+ index))))

(defun sartd:json-adapt (root / data cg pk hy trvals rvvals trailers i tr res supports sx sw r lc cc poly)
  (setq data (sartd:json-get root "data"))
  (setq cg (sartd:json-get data "cg"))
  (setq pk (sartd:json-get data "pk"))
  (setq hy (sartd:json-get data "hy"))
  (setq trvals (sartd:json-items (sartd:json-get data "tr")))
  (setq r (sartd:json-get data "r"))
  (setq rvvals (sartd:json-items (sartd:json-get r "rv")))
  (setq trailers nil i 0)
  (foreach tr trvals
    (setq res (if (and rvvals (< i (length rvvals))) (nth i rvvals) nil))
    (setq trailers (append trailers (list (sartd:json-adapt-trailer tr res i))))
    (setq i (1+ i)))
  (setq supports (sartd:json-items (sartd:json-get data "su")))
  (setq sx nil sw nil)
  (foreach tr supports
    (setq sx (append sx (list (sartd:j-mm tr "x" 0.0))))
    (setq sw (append sw (list (sartd:j-mm tr "w" 400.0)))))
  (setq lc (sartd:json-get r "lc") cc (sartd:json-get r "cc"))
  (setq poly (sartd:json-items (sartd:json-get r "pg")))
  (list
    (cons 'json-root root) (cons 'json-result r) (cons 'json-source sartd:*json-source*)
    (cons 'htrailer (sartd:j-mm (car trailers) "dh" 1250.0))
    (cons 'deck-height (sartd:j-mm (car trailers) "dh" 1250.0))
    (cons 'load-length (sartd:j-mm cg "l" 1.0)) (cons 'load-width (sartd:j-mm cg "w" 1.0))
    (cons 'load-height (sartd:j-mm cg "h" 1.0)) (cons 'cargo-name (sartd:json-string (sartd:json-get cg "n")))
    (cons 'cargo-weight (sartd:j-mass cg "m" 0.0))
    (cons 'cargo-cog-x (sartd:j-mm cg "x" 0.0)) (cons 'cargo-cog-y (sartd:j-mm cg "y" 0.0))
    (cons 'cargo-cog-z (sartd:j-mm cg "z" 0.0)) (cons 'cog-env-x (sartd:j-mm cg "exn" 0.0))
    (cons 'cog-env-y (sartd:j-mm cg "eyn" 0.0)) (cons 'packing-weight (sartd:j-mass pk "m" 0.0))
    (cons 'packing-height (sartd:j-mm pk "h" 0.0)) (cons 'packing-cog-x (sartd:j-mm pk "x" 0.0))
    (cons 'packing-cog-y (sartd:j-mm pk "y" 0.0)) (cons 'packing-cog-z (sartd:j-mm pk "z" 0.0))
    (cons 'support-x sx) (cons 'support-weight sw)
    (cons 'combined-weight (sartd:json-number-or (sartd:json-get r "tm") 0.0))
    (cons 'combined-cog-x (sartd:j-mm lc "x" (sartd:j-mm cg "x" 0.0)))
    (cons 'combined-cog-y (sartd:j-mm lc "y" (sartd:j-mm cg "y" 0.0)))
    (cons 'combined-cog-z (sartd:j-mm lc "z" (sartd:j-mm cg "z" 0.0)))
    (cons 'trailers trailers) (cons 'trailer-count (length trailers))
    (cons 'total-axles (apply '+ (mapcar '(lambda (x) (cdr (assoc 'axles x))) trailers)))
    (cons 'total-powerpacks 0) (cons 'trailer-y-min (if trailers (apply 'min (mapcar '(lambda (x) (cdr (assoc 'y x))) trailers)) 0.0))
    (cons 'trailer-y-max (if trailers (apply 'max (mapcar '(lambda (x) (cdr (assoc 'y x))) trailers)) 0.0))
    (cons 'hydraulic-grouping (if (sartd:json-object-p hy) (sartd:json-get hy "g") nil))
    (cons 'pinned-axles (if (sartd:json-object-p hy) (sartd:json-items (sartd:json-get hy "pi")) nil))
    (cons 'hydraulic-mode (if (sartd:json-object-p hy) (sartd:json-string (sartd:json-get hy "md")) nil))
    (cons 'hydraulic-split (if (sartd:json-object-p hy) (sartd:json-number-or (sartd:json-get hy "sp") nil) nil))
    (cons 'json-hydraulics hy) (cons 'json-polygon poly)
    (cons 'json-axle-points (sartd:json-items (sartd:json-get r "ax")))
    (cons 'json-case-points (sartd:json-get r "cp"))
    (cons 'json-supports supports) (cons 'json-status (sartd:json-string (sartd:json-get r "st")))
    (cons 'longitudinal-up (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "rls") 0.0))
    (cons 'transversal (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "rts") 0.0))
    (cons 'vwind (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "ws") 0.0))
    (cons 'accel-long (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "la") 0.0))))

(defun sartd:json-point-mm (p / x y)
  (if (sartd:json-array-p p)
    (list (* 1000.0 (sartd:json-number-or (nth 0 (cdr p)) 0.0))
          (* 1000.0 (sartd:json-number-or (nth 1 (cdr p)) 0.0)))
    (if (sartd:json-object-p p)
      (list (sartd:j-mm p "x" 0.0) (sartd:j-mm p "y" 0.0)) nil)))

(defun sartd:json-draw-result-overlays (data planBase sideBase endBase / poly pts p x y text status cases)
  ; Draw the authoritative result geometry after the legacy arrangement.  This intentionally uses
  ; a polygon with its supplied point count; it never manufactures a triangle for four-point data.
  (setq poly (sartd:g 'json-polygon data) pts nil)
  (foreach p poly
    (setq p (sartd:json-point-mm p))
    (if p (setq pts (append pts (list (list (+ (car planBase) (car p)) (+ (cadr planBase) (cadr p)))))))
  (if (>= (length pts) 3)
    (progn
      (sartd:add-lwpoly pts "SARTD-HYD-RESULT" T)
      (sartd:pr (strcat "Authoritative stability boundary drawn from " (itoa (length pts)) " supplied result point(s)."))))
  (setq status (sartd:g 'json-status data))
  (if status (sartd:add-text (strcat "RESULT: " status) (list (car planBase) (- (cadr planBase) 700.0)) 220.0 "SARTD-ANNOTATION"))
  (foreach p (sartd:g 'json-supports data)
    (setq x (sartd:j-mm p "x" 0.0) y (sartd:j-mm p "w" 400.0))
    (sartd:add-line (list (+ (car sideBase) x) (cadr sideBase))
                   (list (+ (car sideBase) x) (+ (cadr sideBase) 800.0))
                   "SARTD-SUPPORT-STATUS")))
  T)

(defun sartd:json-source-path (/ path default)
  (setq default (getenv "SARTD_JSON_LAST"))
  (if (and default (= (strcase (getenv "SARTD_JSON_AUTOMATED")) "1") (findfile default))
    default
    (getfiled "Select Trailer Stability AutoCAD JSON export" (if default default "") "json" 0)))

(defun sartd:json-load-validated (path / root verdict)
  (setq sartd:*json-source* path)
  (setq sartd:*json-log* (strcat path ".lisp.log"))
  (setq root (sartd:json-read-text path))
  (if (not root)
    (progn (sartd:json-log (if sartd:*json-error* sartd:*json-error* "JSON parse failed.")) nil)
    (progn
      (setq verdict (sartd:json-validate root))
      (if (not (car verdict))
        (progn
          (foreach e (cadr verdict) (sartd:json-log e))
          nil)
        (progn
          (setenv "SARTD_JSON_LAST" path)
          (setq sartd:*json-root* root sartd:*json-data* (sartd:json-adapt root))
          (sartd:json-log "Envelope, coded key, geometry and authoritative result validated.")
          sartd:*json-data*)))))

(defun sartd:json-summary (data / tr r poly)
  (setq tr (sartd:g 'trailers data) r (sartd:g 'json-result data) poly (sartd:g 'json-polygon data))
  (sartd:pr (strcat "JSON source: " (sartd:str (sartd:g 'json-source data))))
  (sartd:pr (strcat "Case: " (sartd:str (sartd:json-string (sartd:json-get (sartd:json-get (sartd:json-get sartd:*json-root* "data") "c") "id")))))
  (sartd:pr (strcat "Trailers: " (itoa (length tr)) ", authoritative boundary points: " (itoa (length poly))))
  (sartd:pr (strcat "Result status: " (sartd:str (sartd:g 'json-status data))))
  T)

(defun sartd:json-run-drawing (data / base ok)
  ; All validation has completed before this point.  Existing generated objects are only removed
  ; immediately before drawing, and every optional stage is caught so AutoCAD remains usable.
  (sartd:setup-layers)
  (setq base (list 0.0 0.0 0.0))
  (sartd:delete-generated)
  (setq sartd:*space-override* (sartd:modelspace))
  (setq ok (vl-catch-all-apply 'sartd:draw-arrangement (list data base)))
  (if (vl-catch-all-error-p ok)
    (progn
      (sartd:json-log (strcat "Existing arrangement renderer failed: " (vl-catch-all-error-message ok)))
      (setq ok nil))
    (sartd:json-log "Model arrangement rendered without Excel."))
  (if ok
    (sartd:json-draw-result-overlays data base base base))
  (setq sartd:*space-override* nil)
  ok)

(defun c:SARTDJSONDATA (/ path data)
  (vl-load-com)
  (setq path (sartd:json-source-path))
  (if (and path (/= path ""))
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn (sartd:json-summary data) (sartd:json-log "SARTDJSONDATA complete."))
        (sartd:json-log "SARTDJSONDATA stopped before drawing.")))
    (sartd:pr "No JSON file selected; SARTDJSONDATA stopped."))
  (princ))

(defun c:SARTDJSON (/ path data result)
  (vl-load-com)
  (setq path (sartd:json-source-path))
  (if (and path (/= path ""))
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn
          (sartd:json-summary data)
          (setq result (vl-catch-all-apply 'sartd:json-run-drawing (list data)))
          (if (vl-catch-all-error-p result)
            (sartd:json-log (strcat "SARTDJSON failed safely: " (vl-catch-all-error-message result)))
            (if result (sartd:json-log "SARTDJSON complete.") (sartd:json-log "SARTDJSON stopped; no drawing result was committed."))))
        (sartd:json-log "SARTDJSON stopped before drawing.")))
    (sartd:pr "No JSON file selected; SARTDJSON stopped."))
  (princ))

(princ "\nSARTDJSON and SARTDJSONDATA ready. JSON path uses no Excel/COM workbook transfer.")
(princ)

; =================================================================================================
; v1.16 IMPORT RELIABILITY HOTFIX
; -------------------------------------------------------------------------------------------------
; - Captures the loaded LSP folder while the file is loading so the bundled Autocad Blocks folder
;   can be found reliably after APPLOAD.
; - Requires a validated block library before any drawing is deleted or generated and provides an
;   explicit SARTDBLOCKS command for changing the configured folder.
; - Resolves the intended calculation workbook instead of trusting an unrelated Excel ActiveWorkbook.
; - Finds calculation/export sheets by normalised names and accepted CAD/DWG aliases, including in
;   protected/locked workbooks, and prints the actual workbook and available sheets on failure.
; - Corrects the coded JSON adapter for cargo datum offsets, combined COG, deck height, hydraulic
;   side/group definitions and trailer-specific pinned axle lines.
; =================================================================================================

(setq sartd:*version* "1.16")
(setq sartd:*v116-load-root*
  (cond
    ((and (boundp '*load-truename*) *load-truename*)
      (vl-filename-directory (sartd:str *load-truename*)))
    ((and (boundp '*load-pathname*) *load-pathname*)
      (vl-filename-directory (sartd:str *load-pathname*)))
    (T nil)))

(defun sartd:v100-loaded-file-folder (/ p)
  (cond
    ((and sartd:*v116-load-root* (vl-file-directory-p sartd:*v116-load-root*))
      sartd:*v116-load-root*)
    ((and (boundp '*load-truename*) *load-truename*)
      (vl-filename-directory (sartd:str *load-truename*)))
    ((and (boundp '*load-pathname*) *load-pathname*)
      (vl-filename-directory (sartd:str *load-pathname*)))
    ((setq p (findfile sartd:*release-file*))
      (vl-filename-directory p))
    (T nil)))

(defun sartd:v116-alnum-name (value / s out i ch code)
  ; Upper-case comparison key that ignores spaces, punctuation, underscores and non-breaking spaces.
  (setq s (strcase (sartd:str value)) out "" i 1)
  (while (<= i (strlen s))
    (setq ch (substr s i 1) code (ascii ch))
    (if (or (and (>= code 48) (<= code 57))
            (and (>= code 65) (<= code 90)))
      (setq out (strcat out ch)))
    (setq i (1+ i)))
  out)

(defun sartd:v116-sheet-name-match-p (actual requested / a r)
  (setq a (sartd:v116-alnum-name actual) r (sartd:v116-alnum-name requested))
  (cond
    ((= a r) T)
    ((member r '("LOADANDSTABILITYCALCULATION" "LOADSTABILITYCALCULATION"))
      (member a '("LOADANDSTABILITYCALCULATION" "LOADSTABILITYCALCULATION"
                  "LOADANDSTABILITYCALCULATIONS" "LOADSTABILITYCALCULATIONS")))
    ((member r '("EXPORTTODWG" "EXPORTTOCAD" "EXPORTTOAUTOCAD"))
      (member a '("EXPORTTODWG" "EXPORTTOCAD" "EXPORTTOAUTOCAD" "DWGEXPORT"
                  "CADEXPORT" "AUTOCADEXPORT" "AUTOCADOUTPUT" "CADOUTPUT")))
    (T nil)))

(defun sartd:v116-find-sheet (wb name / sheets exact sh actual found count index)
  (setq found nil)
  (if wb
    (progn
      (setq sheets (vl-catch-all-apply 'vlax-get-property (list wb 'Worksheets)))
      (if (not (vl-catch-all-error-p sheets))
        (progn
          ; Fast exact lookup first. This also works for hidden and veryHidden worksheets.
          (setq exact (vl-catch-all-apply 'vlax-get-property (list sheets 'Item name)))
          ; Excel/ActiveX can return NIL (rather than an error object) when Item(name) is absent.
          ; Only accept an actual worksheet object; otherwise enumerate the sheet aliases below.
          (if (and exact
                   (not (vl-catch-all-error-p exact))
                   (= (type exact) 'VLA-OBJECT))
            (setq found exact)
            (progn
              ; Do not retain a VLAX-FOR iterator as the return object. Excel releases that
              ; transient iterator at the end of enumeration in some AutoCAD/Excel versions.
              ; Retrieve the matching worksheet by numeric Item index so the returned COM object
              ; remains live for all subsequent Range reads.
              (setq count (vl-catch-all-apply 'vlax-get-property (list sheets 'Count))
                    index 1)
              (if (vl-catch-all-error-p count) (setq count 0))
              (while (and (not found) (<= index count))
                (setq sh (vl-catch-all-apply 'vlax-get-property (list sheets 'Item index)))
                (if (and sh (not (vl-catch-all-error-p sh)))
                  (progn
                    (setq actual (vl-catch-all-apply 'vlax-get-property (list sh 'Name)))
                    (if (and (not (vl-catch-all-error-p actual))
                             (sartd:v116-sheet-name-match-p actual name))
                      (setq found sh))))
                (setq index (1+ index))))))))
  found))

(defun sartd:v116-workbook-path (wb / p)
  (if wb
    (progn
      (setq p (vl-catch-all-apply 'vlax-get-property (list wb 'FullName)))
      (if (vl-catch-all-error-p p) nil p))
    nil))

(defun sartd:v116-sheet-names (wb / sheets sh name out)
  (setq out nil)
  (if wb
    (progn
      (setq sheets (vl-catch-all-apply 'vlax-get-property (list wb 'Worksheets)))
      (if (not (vl-catch-all-error-p sheets))
        (vlax-for sh sheets
          (setq name (vl-catch-all-apply 'vlax-get-property (list sh 'Name)))
          (if (not (vl-catch-all-error-p name))
            (setq out (append out (list name))))))))
  out)

(defun sartd:v116-join (items separator / out item)
  (setq out "")
  (foreach item items
    (setq out (strcat out (if (= out "") "" separator) (sartd:str item))))
  out)

(defun sartd:sheet (wb name / sh path names)
  (setq sh (sartd:v116-find-sheet wb name))
  (if sh
    sh
    (progn
      (setq path (sartd:v116-workbook-path wb))
      (setq names (sartd:v116-sheet-names wb))
      (sartd:pr
        (strcat
          "Required worksheet was not found: " name
          ". Workbook inspected: " (if path path "<unavailable>")
          ". Available worksheets: " (if names (sartd:v116-join names " | ") "<none returned by Excel>")))
      nil)))

(defun sartd:v116-calculation-workbook-p (wb)
  (if (sartd:v116-find-sheet wb sartd:*sheet-main*) T nil))

(defun sartd:v116-find-open-calculation-workbook (/ xl wbs active wb candidates path)
  ; Prefer a valid active workbook. If Excel's ROT points at another workbook/instance, scan every
  ; workbook visible to that Excel instance and accept one unambiguous calculation workbook.
  (setq candidates nil)
  (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
  (if (not (vl-catch-all-error-p xl))
    (progn
      (setq active (vl-catch-all-apply 'vlax-get-property (list xl 'ActiveWorkbook)))
      (if (and (not (vl-catch-all-error-p active)) (sartd:v116-calculation-workbook-p active))
        active
        (progn
          (setq wbs (vl-catch-all-apply 'vlax-get-property (list xl 'Workbooks)))
          (if (not (vl-catch-all-error-p wbs))
            (vlax-for wb wbs
              (if (sartd:v116-calculation-workbook-p wb)
                (setq candidates (append candidates (list wb))))))
          (cond
            ((= (length candidates) 1)
              (setq wb (car candidates))
              (sartd:pr
                (strcat "Excel ActiveWorkbook was not the calculation workbook. Using the only valid open workbook: "
                        (sartd:str (sartd:v116-workbook-path wb))))
              wb)
            ((> (length candidates) 1)
              (sartd:pr "More than one open calculation workbook was found. Use Browse to select the intended file.")
              (foreach wb candidates
                (setq path (sartd:v116-workbook-path wb))
                (if path (sartd:pr (strcat "  candidate: " path))))
              nil)
            (T
              (sartd:pr "No open Excel workbook with a Load and Stability Calculation worksheet was found.")
              nil)))))
    (progn
      (sartd:pr "Excel is not currently exposing an open workbook. Use Browse to select the calculation file.")
      nil)))

(defun sartd:v116-validate-workbook (wb / path)
  (if (not wb)
    nil
    (if (sartd:v116-calculation-workbook-p wb)
      (progn
        (setq path (sartd:v116-workbook-path wb))
        (if path (setenv "SARTD_LAST_XLS" path))
        wb)
      (progn
        ; Use sartd:sheet here so the error contains the selected path and every actual sheet name.
        (sartd:sheet wb sartd:*sheet-main*)
        nil))))

(defun sartd:get-excel-app (/ xl)
  ; Some AutoCAD/Excel instance combinations return NIL rather than an ActiveX error object. Guard
  ; both outcomes so the user receives a useful source message instead of "bad VLA-OBJECT nil".
  (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
  (if (or (vl-catch-all-error-p xl) (not xl))
    (setq xl (vl-catch-all-apply 'vlax-create-object (list "Excel.Application"))))
  (if (or (vl-catch-all-error-p xl) (not xl))
    (progn
      (sartd:pr "AutoCAD could not connect to Microsoft Excel. Open the calculation workbook in desktop Excel, then use Active; or use Browse.")
      nil)
    (progn
      (vl-catch-all-apply 'vlax-put-property (list xl 'Visible :vlax-true))
      xl)))

(setq sartd:*v116-dedicated-excel* nil
      sartd:*v116-dedicated-workbook* nil
      sartd:*v116-dedicated-path* nil)

(defun sartd:v116-object-live-p (obj / probe)
  (if (and obj (= (type obj) 'VLA-OBJECT))
    (progn
      (setq probe (vl-catch-all-apply 'vlax-get-property (list obj 'Name)))
      (not (vl-catch-all-error-p probe)))
    nil))

(defun sartd:v116-cached-workbook (path / livePath)
  (if (and path sartd:*v116-dedicated-workbook*
           (sartd:v116-object-live-p sartd:*v116-dedicated-workbook*))
    (progn
      (setq livePath (sartd:v116-workbook-path sartd:*v116-dedicated-workbook*))
      (if (and livePath (= (strcase livePath) (strcase path)))
        sartd:*v116-dedicated-workbook*
        nil))
    nil))

(defun sartd:workbook-by-path (path / cached xl wbs wb out fn)
  ; AutoCAD can only obtain one Excel ROT entry. Check the dedicated path-based instance first,
  ; then scan the Excel instance returned by the ROT.
  (setq cached (sartd:v116-cached-workbook path))
  (if cached
    cached
    (progn
      (setq out nil)
      (if (and path (/= path ""))
        (progn
          (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
          (if (and (not (vl-catch-all-error-p xl)) xl)
            (progn
              (setq wbs (vl-catch-all-apply 'vlax-get-property (list xl 'Workbooks)))
              (if (not (vl-catch-all-error-p wbs))
                (vlax-for wb wbs
                  (if (not out)
                    (progn
                      (setq fn (sartd:v116-workbook-path wb))
                      (if (and fn (= (strcase fn) (strcase path)))
                        (setq out wb))))))))))
      out)))

(defun sartd:v116-open-dedicated-workbook (path / xl wbs wb repaired)
  ; A workbook may already be open in an Excel process which is not the one exposed through the
  ; Running Object Table. A fresh Excel application can still open the selected path read-only.
  ; Retain both COM objects so subsequent refreshes reuse the same verified workbook.
  (setq xl (vl-catch-all-apply 'vlax-create-object (list "Excel.Application")))
  (if (or (vl-catch-all-error-p xl) (not xl))
    nil
    (progn
      (vl-catch-all-apply 'vlax-put-property (list xl 'Visible :vlax-true))
      (vl-catch-all-apply 'vlax-put-property (list xl 'DisplayAlerts :vlax-false))
      (setq wbs (vl-catch-all-apply 'vlax-get-property (list xl 'Workbooks)))
      (if (vl-catch-all-error-p wbs)
        (setq wb nil)
        (setq wb (vl-catch-all-apply 'vlax-invoke-method
                   (list wbs 'Open path 0 :vlax-true))))
      ; Files downloaded from the web or copied from a controlled document store can carry a
      ; Mark-of-the-Web/file-validation flag. Excel then rejects the ordinary COM Open call even
      ; though desktop Excel can show the workbook. Retry read-only with xlRepairFile (1). This
      ; preserves formula results and lets the drafter read locked calculation workbooks without
      ; editing or saving them.
      (if (or (vl-catch-all-error-p wb) (not wb))
        (progn
          (setq repaired T)
          (sartd:pr "Standard Excel open was blocked; retrying read-only with Excel file-repair mode.")
          (setq wb (vl-catch-all-apply 'vlax-invoke-method
                     (list wbs 'Open path 0 :vlax-true 5 "" "" :vlax-true 2 ""
                           :vlax-false :vlax-false 0 :vlax-false :vlax-true 1)))))
      (if (or (vl-catch-all-error-p wb) (not wb) (not (sartd:v116-object-live-p wb)))
        (progn
          (vl-catch-all-apply 'vlax-invoke-method (list xl 'Quit))
          (setq wb nil))
        (progn
          (setq sartd:*v116-dedicated-excel* xl
                sartd:*v116-dedicated-workbook* wb
                sartd:*v116-dedicated-path* path)
          (sartd:pr
            (strcat
              "Opened a verified read-only calculation source by full path"
              (if repaired " using Excel repair mode" "") ": " path))))
      wb)))

(defun sartd:open-workbook (path / wb)
  (setq wb (sartd:workbook-by-path path))
  (if (not (and wb
                (sartd:v116-object-live-p wb)
                (sartd:v116-calculation-workbook-p wb)))
    (progn
      (sartd:pr "Attaching to the selected calculation file by full path in a dedicated read-only Excel instance.")
      (setq wb (sartd:v116-open-dedicated-workbook path))))
  (if (not wb)
    (sartd:pr
      (strcat "Excel could not open the selected calculation file: " path
              ". Keep the workbook open and saved, then use Active for its live values or Browse to select its exact full path.")))
  wb)

(defun sartd:v116-workbook-for-path (path / wb)
  ; Do not use AutoLISP OR to choose between COM objects: OR returns T, not the successful object.
  (setq wb (sartd:workbook-by-path path))
  (if (not (and wb (sartd:v116-object-live-p wb)))
    (setq wb (sartd:open-workbook path)))
  wb)

(defun sartd:choose-workbook (refresh / default opt path wb)
  (setq default (if refresh "Last" "Active"))
  (if (and (boundp 'sartd:*auto-excel-source*) sartd:*auto-excel-source*)
    (setq opt sartd:*auto-excel-source*)
    (progn
      (initget "Active Browse Last")
      (setq opt (getkword (strcat "\nCalculation source [Active/Browse/Last] <" default ">: ")))
      (if (null opt) (setq opt default))))
  (cond
    ((= opt "Active")
      (setq wb (sartd:v116-find-open-calculation-workbook)))
    ((= opt "Browse")
      (setq path (getfiled "Select trailer calculation workbook" (sartd:envstr "SARTD_LAST_XLS") "xls;xlsx;xlsm" 0))
      (if path
        (setq wb (sartd:v116-workbook-for-path path))))
    ((= opt "Last")
      (setq path (getenv "SARTD_LAST_XLS"))
      (if (and path (/= path "") (findfile path))
        (setq wb (sartd:v116-workbook-for-path path))
        (sartd:pr "No valid last calculation workbook is stored. Use Browse or Active."))))
  (sartd:v116-validate-workbook wb))

(defun sartd:v59-select-excel-source (/ default opt path wb)
  ; Lock every workflow to an inspected full path. Returning Last prevents a later stage from
  ; silently switching to a different ActiveWorkbook or Excel instance.
  (if (and (boundp 'sartd:*web-workbook-path*) sartd:*web-workbook-path*
           (sartd:v59-file-exists-p sartd:*web-workbook-path*))
    (progn
      (setenv "SARTD_LAST_XLS" sartd:*web-workbook-path*)
      (setq sartd:*v59-excel-source-label*
        (strcat "Transfer " (if sartd:*web-transfer-code* sartd:*web-transfer-code* "")
                ": " sartd:*web-workbook-path*))
      "Last")
    (progn
      (setq default (if (sartd:v59-file-exists-p (getenv "SARTD_LAST_XLS")) "Last" "Active"))
      (initget "Active Browse Last")
      (setq opt (getkword (strcat "\nCalculation source [Active/Browse/Last] <" default ">: ")))
      (if (null opt) (setq opt default))
      (cond
        ((= opt "Active")
          (setq wb (sartd:v116-find-open-calculation-workbook))
          (if wb
            (progn
              (setq path (sartd:v116-workbook-path wb))
              (setenv "SARTD_LAST_XLS" path)
              (setq sartd:*v59-excel-source-label* (strcat "Validated open workbook: " path))
              "Last")
            nil))
        ((= opt "Browse")
          (setq path (getfiled "Select trailer calculation workbook" (getenv "SARTD_LAST_XLS") "xls;xlsx;xlsm" 0))
          (if (and path (/= path ""))
            (progn
              (setenv "SARTD_LAST_XLS" path)
              (setq sartd:*v59-excel-source-label* (strcat "Selected workbook: " path))
              "Last")
            (progn (sartd:pr "Workbook selection cancelled.") nil)))
        ((= opt "Last")
          (setq path (getenv "SARTD_LAST_XLS"))
          (if (and path (/= path "") (findfile path))
            (progn
              (setq sartd:*v59-excel-source-label* (strcat "Last validated workbook: " path))
              "Last")
            (progn (sartd:pr "No valid last workbook is stored. Use Browse or Active.") nil)))
        (T nil)))))

(defun sartd:v116-configured-library-path (/ path folder)
  (cond
    ((and (setq path (getenv sartd:*library-env*))
          (/= path "") (sartd:v100-file-exists-p path))
      (sartd:v100-store-library-path path))
    ((and (setq folder (getenv sartd:*blocks-folder-env*))
          (/= folder "") (setq path (sartd:v100-library-in-folder folder)))
      (sartd:v100-store-library-path path))
    (T nil)))

(defun sartd:v116-prompt-block-library (/ path)
  ; Selecting the actual library DWG is clearer and more reliable than a Windows folder browser.
  ; The selected DWG's parent folder is stored automatically for subsequent runs.
  (princ
    (strcat
      "\nAutoCAD block setup is required. Select " sartd:*library-default-name*
      " from the Autocad Blocks folder."))
  (setq path
    (getfiled
      "Select AutoCAD block library DWG"
      (sartd:v100-dialog-default-library)
      "dwg"
      0))
  (if (and path (/= path "") (sartd:v100-file-exists-p path))
    (sartd:v100-store-library-path path)
    (progn
      (sartd:pr "No valid AutoCAD block-library DWG was selected.")
      nil)))

(defun sartd:v116-ensure-block-library (/ missing path bundled prompted)
  (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks)))
  (if (not missing)
    T
    (progn
      ; Import a remembered library first. If it is stale, incomplete or the wrong DWG, immediately
      ; ask for the exact block-library file rather than continuing with a partial drawing.
      (setq path (sartd:v116-configured-library-path))
      (if (not path)
        (progn
          (sartd:pr "The AutoCAD block library has not been configured for this installation.")
          (setq prompted T)
          (setq path (sartd:v116-prompt-block-library))))
      (if path (sartd:import-dwg-defs path))
      (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks)))
      (if (and missing (not prompted))
        (progn
          (sartd:pr "The remembered block library did not provide every required block. Select the correct library DWG.")
          (setq prompted T)
          (setq path (sartd:v116-prompt-block-library))
          (if path (sartd:import-dwg-defs path))
          (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks)))))
      (if (and missing (not path))
        (progn
          (setq bundled (sartd:v100-bundled-blocks-folder))
          (if bundled (setq path (sartd:v100-library-in-folder bundled)))
          (if path
            (progn
              (sartd:v100-store-library-path path)
              (sartd:pr (strcat "Using bundled AutoCAD block library: " path))
              (sartd:import-dwg-defs path)))))
      (setq missing (append (sartd:missing-core-blocks) (sartd:missing-annotation-blocks)))
      (if missing
        (progn
          (sartd:pr "Drawing stopped: required block definitions are still missing.")
          (foreach path missing (sartd:pr (strcat "  missing block: " path)))
          (sartd:pr "Run SARTDBLOCKS and select SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg from the Autocad Blocks folder.")
          nil)
        (progn
          (sartd:pr "AutoCAD block library validated.")
          T)))))

(defun sartd:ensure-library-defs () (sartd:v116-ensure-block-library))
(defun sartd:ensure-core-blocks () (sartd:v116-ensure-block-library))

(defun c:SARTDBLOCKS (/ path)
  (vl-load-com)
  (setq path (sartd:v116-prompt-block-library))
  (if path
    (progn
      (sartd:pr (strcat "Configured AutoCAD block library: " path))
      (sartd:v116-ensure-block-library))
    (sartd:pr "Block-library selection cancelled; the previous valid configuration was retained."))
  (princ))

(defun sartd:v116-json-group-number (corners key fallback / n)
  (setq n (if (sartd:json-object-p corners)
            (sartd:json-number-value (sartd:json-get corners key)) nil))
  (if (numberp n) (fix n) fallback))

(defun sartd:v116-json-hydraulic-definitions (hy trailer-count / defs groupings grouping idx split corners groups first last rl rr fl fr)
  ; Convert the web grouping records into the exact two-side definition shape used by the existing
  ; hydraulic block renderer. TOP is the left/+Y circuit; BOTTOM is the right/-Y circuit.
  (setq defs nil idx 1)
  (setq groupings (if (sartd:json-object-p hy) (sartd:json-items (sartd:json-get hy "g")) nil))
  (foreach grouping groupings
    (if (<= idx trailer-count)
      (progn
        (setq split (fix (sartd:json-number-or (sartd:json-get grouping "splitAfterAxleLine")
                                               (sartd:json-number-or (sartd:json-get hy "sp") 0))))
        (setq corners (sartd:json-get grouping "cornerGroups"))
        (setq groups (sartd:json-items (sartd:json-get grouping "groups")))
        (setq first (if groups (fix (sartd:json-number-or (car groups) 1)) 1))
        (setq last (if groups (fix (sartd:json-number-or (car (reverse groups)) first)) first))
        (setq rl (sartd:v116-json-group-number corners "rearLeft" first))
        (setq rr (sartd:v116-json-group-number corners "rearRight" first))
        (setq fl (sartd:v116-json-group-number corners "frontLeft" last))
        (setq fr (sartd:v116-json-group-number corners "frontRight" last))
        (setq defs
          (append defs
            (list
              (list (cons 'trailer-index idx) (cons 'side-name "TOP") (cons 'side-factor 1.0)
                    (cons 'group-before rl) (cons 'group-after fl) (cons 'split-after split))
              (list (cons 'trailer-index idx) (cons 'side-name "BOTTOM") (cons 'side-factor 0.0)
                    (cons 'group-before rr) (cons 'group-after fr) (cons 'split-after split)))))))
    (setq idx (1+ idx)))
  defs)

(defun sartd:v116-json-pinned-axles (hy trailer-count / out groupings grouping idx pins p n fallback)
  (setq out nil idx 1)
  (setq groupings (if (sartd:json-object-p hy) (sartd:json-items (sartd:json-get hy "g")) nil))
  (foreach grouping groupings
    (if (<= idx trailer-count)
      (progn
        (setq pins nil)
        (foreach p (sartd:json-items (sartd:json-get grouping "pinnedAxleLines"))
          (setq n (sartd:json-number-value p))
          (if (and (numberp n) (> n 0)) (setq pins (append pins (list (fix n))))))
        (if pins (setq out (append out (list (cons idx pins)))))))
    (setq idx (1+ idx)))
  ; Compatibility with the compact first-trailer pin list in early coded exports.
  (if (and (not out) (sartd:json-object-p hy))
    (progn
      (setq fallback nil)
      (foreach p (sartd:json-items (sartd:json-get hy "pi"))
        (setq n (sartd:json-number-value p))
        (if (and (numberp n) (> n 0)) (setq fallback (append fallback (list (fix n))))))
      (if fallback (setq out (list (cons 1 fallback))))))
  out)

(defun sartd:json-adapt-trailer (tr resolved index / name ax x y len wid pl pr ppul ppur spacing deck)
  (setq name (sartd:json-string (sartd:json-get tr "n")))
  (setq ax (fix (sartd:json-number-or (sartd:json-get tr "al") 1)))
  (setq spacing (sartd:j-mm tr "ap" 1400.0))
  (setq x (sartd:j-mm (if resolved resolved tr) "startXM" (sartd:j-mm tr "x" 0.0)))
  (setq y (sartd:j-mm (if resolved resolved tr) "centreYM" (sartd:j-mm tr "y" 0.0)))
  (setq len (sartd:j-mm (if resolved resolved tr) "lengthM" (* (max 1 ax) spacing)))
  (setq wid (sartd:j-mm (if resolved resolved tr) "widthM" (sartd:j-mm tr "w" 2430.0)))
  (setq pl (sartd:j-mm (if resolved resolved tr) "ppuLeftLengthM" (sartd:j-mm tr "pl" 0.0)))
  (setq pr (sartd:j-mm (if resolved resolved tr) "ppuRightLengthM" (sartd:j-mm tr "fl" 0.0)))
  (setq deck (sartd:j-mm tr "dh" 1250.0))
  (setq ppul (sartd:json-bool-value (sartd:json-get tr "rb") nil))
  (setq ppur (sartd:json-bool-value (sartd:json-get tr "ff") nil))
  (list (cons 'row (+ 89 index)) (cons 'type (if name name "TRAILER")) (cons 'model name)
        (cons 'axles ax) (cons 'x x) (cons 'y y) (cons 'spacing spacing)
        (cons 'length len) (cons 'width wid) (cons 'deck-height deck)
        (cons 'ppu-left ppul) (cons 'ppu-right ppur)
        (cons 'ppu-left-length pl) (cons 'ppu-right-length pr)
        (cons 'ppu-state (cond ((and ppul ppur) "BOTH") (ppul "LEFT") (ppur "RIGHT") (T "NONE")))
        (cons 'ppu-left-weight 0.0) (cons 'ppu-right-weight 0.0) (cons 'self-weight 0.0)
        (cons 'trailer-index (1+ index))))

(defun sartd:json-adapt (root / data cg pk hy trvals firstCompact rvvals trailers i tr res supports sx sw r lc cc poly deck ex ey hdefs pins totalAx capacity)
  (setq data (sartd:json-get root "data"))
  (setq cg (sartd:json-get data "cg") pk (sartd:json-get data "pk") hy (sartd:json-get data "hy"))
  (setq trvals (sartd:json-items (sartd:json-get data "tr")))
  (setq firstCompact (if trvals (car trvals) nil))
  (setq r (sartd:json-get data "r") rvvals (sartd:json-items (sartd:json-get r "rv")))
  (setq trailers nil i 0)
  (foreach tr trvals
    (setq res (if (and rvvals (< i (length rvvals))) (nth i rvvals) nil))
    (setq trailers (append trailers (list (sartd:json-adapt-trailer tr res i))))
    (setq i (1+ i)))
  (setq supports (sartd:json-items (sartd:json-get data "su")) sx nil sw nil)
  (foreach tr supports
    (setq sx (append sx (list (sartd:j-mm tr "x" 0.0))))
    (setq sw (append sw (list (sartd:j-mm tr "w" 400.0)))))
  (setq lc (sartd:json-get r "lc") cc (sartd:json-get r "cc"))
  (setq poly (sartd:json-items (sartd:json-get r "pg")))
  (setq deck (if firstCompact (sartd:j-mm firstCompact "dh" 1250.0) 1250.0))
  (setq ex (sartd:j-mm cg "ex" 0.0) ey (sartd:j-mm cg "ey" 0.0))
  (setq hdefs (sartd:v116-json-hydraulic-definitions hy (length trailers)))
  (setq pins (sartd:v116-json-pinned-axles hy (length trailers)))
  (setq totalAx (if trailers (apply '+ (mapcar '(lambda (x) (cdr (assoc 'axles x))) trailers)) 0))
  (setq capacity (if firstCompact (sartd:json-number-or (sartd:json-get firstCompact "ah") 48.0) 48.0))
  (list
    (cons 'json-root root) (cons 'json-result r) (cons 'json-source sartd:*json-source*)
    (cons 'htrailer deck) (cons 'deck-height deck)
    (cons 'load-extreme-x ex) (cons 'load-extreme-y ey)
    (cons 'load-length (sartd:j-mm cg "l" 1.0)) (cons 'load-width (sartd:j-mm cg "w" 1.0))
    (cons 'load-height (sartd:j-mm cg "h" 1.0)) (cons 'cargo-name (sartd:json-string (sartd:json-get cg "n")))
    (cons 'cargo-weight (sartd:j-mass cg "m" 0.0))
    (cons 'cargo-cog-x (+ ex (sartd:j-mm cg "x" 0.0)))
    (cons 'cargo-cog-y (+ ey (sartd:j-mm cg "y" 0.0)))
    (cons 'cargo-cog-z (sartd:j-mm cg "z" 0.0))
    (cons 'cog-env-x (sartd:j-mm cg "exn" 0.0)) (cons 'cog-env-y (sartd:j-mm cg "eyn" 0.0))
    (cons 'packing-weight (sartd:j-mass pk "m" 0.0)) (cons 'packing-height (sartd:j-mm pk "h" 0.0))
    (cons 'packing-cog-x (+ ex (sartd:j-mm pk "x" 0.0)))
    (cons 'packing-cog-y (+ ey (sartd:j-mm pk "y" 0.0)))
    (cons 'packing-cog-z (sartd:j-mm pk "z" 0.0))
    (cons 'support-x sx) (cons 'support-weight sw)
    (cons 'combined-weight (sartd:json-number-or (sartd:json-get r "tm") 0.0))
    (cons 'combined-cog-x (sartd:j-mm cc "x" (+ ex (sartd:j-mm cg "x" 0.0))))
    (cons 'combined-cog-y (sartd:j-mm cc "y" (+ ey (sartd:j-mm cg "y" 0.0))))
    (cons 'combined-cog-z (sartd:j-mm cc "z" (+ deck (sartd:j-mm cg "z" 0.0))))
    (cons 'trailers trailers) (cons 'trailer-count (length trailers)) (cons 'total-axles totalAx)
    (cons 'total-powerpacks 0)
    (cons 'trailer-y-min (if trailers (apply 'min (mapcar '(lambda (x) (cdr (assoc 'y x))) trailers)) 0.0))
    (cons 'trailer-y-max (if trailers (apply 'max (mapcar '(lambda (x) (cdr (assoc 'y x))) trailers)) 0.0))
    (cons 'hydraulic-grouping hdefs) (cons 'pinned-axles pins)
    (cons 'hydraulic-mode (if (sartd:json-object-p hy) (sartd:json-string (sartd:json-get hy "md")) nil))
    (cons 'hydraulic-split (if (sartd:json-object-p hy) (sartd:json-number-or (sartd:json-get hy "sp") nil) nil))
    (cons 'json-hydraulics hy) (cons 'json-polygon poly)
    (cons 'json-axle-points (sartd:json-items (sartd:json-get r "ax")))
    (cons 'json-case-points (sartd:json-get r "cp"))
    (cons 'json-supports supports) (cons 'json-status (sartd:json-string (sartd:json-get r "st")))
    (cons 'export-cogx (/ (sartd:j-mm cc "x" 0.0) 1000.0))
    (cons 'export-cogy (/ (sartd:j-mm cc "y" 0.0) 1000.0))
    (cons 'gross-axle-line-capacity capacity)
    (cons 'longitudinal-up (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "rls") 0.0))
    (cons 'transversal (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "rts") 0.0))
    (cons 'vwind (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "ws") 0.0))
    (cons 'accel-long (sartd:json-number-or (sartd:json-get (sartd:json-get data "en") "la") 0.0))))

(defun sartd:v116-saved-project-json-p (root)
  (and (sartd:json-object-p root)
       (numberp (sartd:json-number-value (sartd:json-get root "schemaVersion")))
       (sartd:json-object-p (sartd:json-get root "cargo"))))

(defun sartd:json-load-validated (path / root verdict)
  (setq sartd:*json-source* path sartd:*json-log* (strcat path ".lisp.log"))
  (setq root (sartd:json-read-text path))
  (cond
    ((not root)
      (sartd:json-log (if sartd:*json-error* sartd:*json-error* "JSON parse failed."))
      nil)
    ((sartd:v116-saved-project-json-p root)
      (sartd:json-log
        "This is a saved project JSON, not the coded AutoCAD drawing export. In Trailer Stability use AutoCAD > Export drawing data, then select the downloaded TRAILER-STABILITY-CAD-DATA JSON file.")
      nil)
    (T
      (setq verdict (sartd:json-validate root))
      (if (not (car verdict))
        (progn (foreach e (cadr verdict) (sartd:json-log e)) nil)
        (progn
          (setenv "SARTD_JSON_LAST" path)
          (setq sartd:*json-root* root sartd:*json-data* (sartd:json-adapt root))
          (sartd:json-log
            (strcat "Validated coded export: "
                    (itoa (length (sartd:g 'trailers sartd:*json-data*))) " trailer(s), "
                    (itoa (length (sartd:g 'hydraulic-grouping sartd:*json-data*))) " hydraulic side definition(s), "
                    (itoa (length (sartd:g 'pinned-axles sartd:*json-data*))) " trailer pin set(s)."))
          sartd:*json-data*)))))

(defun sartd:json-run-drawing (data / base ok space)
  ; Do not delete an existing drawing until the block library, current document and JSON adapter have
  ; all been validated. This is deliberately stricter than the old best-effort renderer.
  (if (not (sartd:v116-ensure-block-library))
    nil
    (progn
      (setq space (vl-catch-all-apply 'sartd:modelspace nil))
      (if (or (vl-catch-all-error-p space) (not space))
        (progn (sartd:json-log "No writable AutoCAD ModelSpace is available.") nil)
        (progn
          (sartd:setup-layers)
          (setq base (list 0.0 0.0 0.0))
          (sartd:delete-generated)
          (setq sartd:*space-override* space)
          (setq ok (vl-catch-all-apply 'sartd:draw-arrangement (list data base)))
          (setq sartd:*space-override* nil)
          (if (vl-catch-all-error-p ok)
            (progn
              (sartd:json-log (strcat "Arrangement renderer failed safely: " (vl-catch-all-error-message ok)))
              nil)
            (progn
              (sartd:json-log "Model arrangement rendered from coded JSON data.")
              (sartd:json-draw-result-overlays data base base base)
              T)))))))

(defun c:SARTDJSON (/ path data result)
  (vl-load-com)
  (if (sartd:v116-ensure-block-library)
    (progn
      (setq path (sartd:json-source-path))
      (if (and path (/= path ""))
        (progn
          (setq data (sartd:json-load-validated path))
          (if data
            (progn
              (sartd:json-summary data)
              (setq result (vl-catch-all-apply 'sartd:json-run-drawing (list data)))
              (if (vl-catch-all-error-p result)
                (sartd:json-log (strcat "SARTDJSON failed safely: " (vl-catch-all-error-message result)))
                (if result (sartd:json-log "SARTDJSON complete.")
                  (sartd:json-log "SARTDJSON stopped; no drawing was committed."))))
            (sartd:json-log "SARTDJSON stopped before drawing.")))
        (sartd:pr "No JSON file selected; SARTDJSON stopped.")))
    (sartd:pr "SARTDJSON stopped because the AutoCAD block library is not ready."))
  (princ))

(defun c:SARTDRUN ()
  (if (sartd:v116-ensure-block-library)
    (progn
      (sartd:v50-clear-scale-cache)
      (sartd:v69-run-workflow))
    (sartd:pr "SARTDRUN stopped because the AutoCAD block library is not ready."))
  (princ))

(defun c:SARTDWEB (/ code path oldpath oldcode result)
  (vl-load-com)
  (if (sartd:v116-ensure-block-library)
    (progn
      (setq code (getstring T "\nEnter website transfer code: "))
      (if code (setq code (vl-string-trim " \t\r\n" code)) (setq code ""))
      (cond
        ((= code "") (sartd:pr "No transfer code entered. SARTDWEB stopped."))
        ((not (setq path (sartd:v100-find-transfer-workbook code)))
          (sartd:pr (strcat "No matching SARENS_AUTOCAD_" code ".xlsm was found in the exchange folder.")))
        (T
          (setq oldpath sartd:*web-workbook-path* oldcode sartd:*web-transfer-code*)
          (setq sartd:*web-workbook-path* path sartd:*web-transfer-code* code)
          (setenv "SARTD_LAST_XLS" path)
          (sartd:pr (strcat "Transfer workbook located: " path))
          (setq result (vl-catch-all-apply 'sartd:v69-run-workflow nil))
          (if (vl-catch-all-error-p result)
            (sartd:pr (strcat "SARTDWEB failed: " (vl-catch-all-error-message result)))
            (if result (sartd:pr "SARTDWEB complete.") (sartd:pr "SARTDWEB stopped before completion.")))
          (setq sartd:*web-workbook-path* oldpath sartd:*web-transfer-code* oldcode))))
    (sartd:pr "SARTDWEB stopped because the AutoCAD block library is not ready."))
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " import reliability hotfix loaded."
    " Commands: SARTDRUN, SARTDWEB, SARTDJSON, SARTDJSONDATA and SARTDBLOCKS."
    " A first unresolved drawing run asks for the exact AutoCAD block-library DWG and stops safely if it is invalid."))
(princ)

; =================================================================================================
; v1.17 ACTIVE EXCEL + INTERACTIVE JSON FINAL OVERRIDES
; =================================================================================================

(setq sartd:*version* "1.17")
(setenv "SARTD_JSON_AUTOMATED" "0")
(setq sartd:*v117-active-original-path* nil)

(defun sartd:v117-companion-path (filename / root path library folder)
  (setq path (findfile filename))
  (if (not path)
    (progn
      (setq root (sartd:v100-loaded-file-folder))
      (if root (setq path (findfile (strcat root "\\" filename))))))
  (if (not path)
    (progn
      (setq root (getenv "SARTD_LSP_FOLDER"))
      (if (and root (/= root ""))
        (setq path (findfile (strcat root "\\" filename))))))
  (if (not path)
    (progn
      (setq library (getenv sartd:*library-env*))
      (if (and library (/= library ""))
        (progn
          (setq folder (vl-filename-directory library)
                root (if folder (vl-filename-directory folder) nil))
          (if root
            (progn
              (setenv "SARTD_LSP_FOLDER" root)
              (setq path (findfile (strcat root "\\" filename)))))))))
  (if (not path)
    (progn
      (setq folder (getenv sartd:*blocks-folder-env*))
      (if (and folder (/= folder ""))
        (progn
          (setq root (vl-filename-directory folder))
          (if root
            (progn
              (setenv "SARTD_LSP_FOLDER" root)
              (setq path (findfile (strcat root "\\" filename)))))))))
  path)

(defun sartd:v117-run-hidden-powershell (script arguments / shell command result)
  (setq result nil)
  (if (and script (findfile script))
    (progn
      (setq command
        (strcat
          "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""
          script "\" " arguments))
      (setq shell (vl-catch-all-apply 'vlax-create-object (list "WScript.Shell")))
      (if (and shell (not (vl-catch-all-error-p shell)))
        (progn
          ; Window style 0 keeps the helper hidden; True waits until its output file is complete.
          (setq result
            (vl-catch-all-apply 'vlax-invoke-method
              (list shell 'Run command 0 :vlax-true)))
          (vl-catch-all-apply 'vlax-release-object (list shell))))))
  (if (vl-catch-all-error-p result) nil result))

(defun sartd:v117-read-lines (path / handle line lines)
  (setq lines nil)
  (if (and path (findfile path) (setq handle (open path "r")))
    (progn
      (while (setq line (read-line handle))
        (if (/= line "") (setq lines (append lines (list line)))))
      (close handle)))
  lines)

(defun sartd:v117-split-active-record (line / position original snapshot)
  (setq position (vl-string-search (chr 9) line))
  (if position
    (progn
      (setq original (substr line 1 position)
            snapshot (substr line (+ position 2)))
      (list original snapshot))
    (list line "")))

(defun sartd:v117-discover-visible-excel (/ helper output arguments result lines records line)
  (setq helper (sartd:v117-companion-path "SARTD_Excel_Active.ps1")
        output (vl-filename-mktemp "SARTD_ACTIVE_EXCEL_" nil ".txt")
        records nil)
  (if (and helper output)
    (progn
      (setq arguments (strcat "-OutputPath \"" output "\""))
      (setq result (sartd:v117-run-hidden-powershell helper arguments))
      (if (and (numberp result) (= result 0))
        (progn
          (setq lines (sartd:v117-read-lines output))
          (foreach line lines
            (setq records (append records (list (sartd:v117-split-active-record line)))))))
      (if (findfile output) (vl-file-delete output))))
  records)

(defun sartd:v117-select-active-record (records / count index record choice valid)
  (setq count (length records) record nil)
  (cond
    ((= count 1) (car records))
    ((> count 1)
      (sartd:pr "More than one visible calculation workbook is open:")
      (setq index 1)
      (foreach record records
        (sartd:pr (strcat "  " (itoa index) ": " (car record)))
        (setq index (1+ index)))
      (setq valid nil)
      (while (not valid)
        (initget 1)
        (setq choice (getint (strcat "\nSelect active calculation workbook [1-" (itoa count) "]: ")))
        (if (and choice (>= choice 1) (<= choice count))
          (setq record (nth (1- choice) records) valid T)
          (sartd:pr "Enter one of the listed workbook numbers.")))
      record)
    (T nil)))

(defun sartd:v117-open-active-record (record / original snapshot target wb)
  (if record
    (progn
      (setq original (car record)
            snapshot (cadr record)
            target (if (and snapshot (/= snapshot "") (findfile snapshot)) snapshot original))
      (setq wb (sartd:v116-workbook-for-path target))
      (if (and wb (sartd:v116-calculation-workbook-p wb))
        (progn
          (setq sartd:*v117-active-original-path* original)
          (setenv "SARTD_LAST_XLS" original)
          (setq sartd:*v59-excel-source-label* (strcat "Live open workbook: " original))
          (if (/= target original)
            (sartd:pr
              (strcat "Reading a current in-memory snapshot of the visible Excel workbook: " original))
            (sartd:pr (strcat "Reading visible Excel workbook: " original)))
          wb)
        nil))
    nil))

(defun sartd:v117-rot-active-fallback (/ xl wb)
  ; Fallback for older Excel installations where the accessibility window bridge is unavailable.
  (setq xl (vl-catch-all-apply 'vlax-get-object (list "Excel.Application")))
  (if (and xl (not (vl-catch-all-error-p xl)))
    (progn
      (setq wb (vl-catch-all-apply 'vlax-get-property (list xl 'ActiveWorkbook)))
      (if (and wb (not (vl-catch-all-error-p wb)) (sartd:v116-calculation-workbook-p wb))
        wb
        nil))
    nil))

(defun sartd:v117-find-active-calculation-workbook (/ records record wb)
  (setq sartd:*v117-active-original-path* nil)
  (setq records (sartd:v117-discover-visible-excel))
  (if records
    (progn
      (setq record (sartd:v117-select-active-record records))
      (setq wb (sartd:v117-open-active-record record)))
    (setq wb (sartd:v117-rot-active-fallback)))
  (if (not wb)
    (sartd:pr
      "No visible open calculation workbook could be read. Keep the workbook open in desktop Excel, then retry Active; Browse remains available for an exact saved path."))
  wb)

; Every existing Active-source workflow now uses the visible-Excel discovery path above.
(defun sartd:v116-find-open-calculation-workbook ()
  (sartd:v117-find-active-calculation-workbook))

(defun sartd:v117-json-prepare-path (path / helper output arguments result)
  (setq helper (sartd:v117-companion-path "SARTD_JSON_Prepare.ps1")
        output (vl-filename-mktemp "SARTD_JSON_DRAWING_" nil ".json"))
  (if (and helper output)
    (progn
      (setq arguments
        (strcat "-InputPath \"" path "\" -OutputPath \"" output "\""))
      (setq result (sartd:v117-run-hidden-powershell helper arguments))
      (if (and (numberp result) (= result 0) (findfile output)) output path))
    path))

(defun sartd:json-load-validated (path / prepared root verdict)
  (setq sartd:*json-source* path sartd:*json-log* (strcat path ".lisp.log"))
  (setq prepared (sartd:v117-json-prepare-path path))
  (setq root (sartd:json-read-text prepared))
  (if (and prepared (/= (strcase prepared) (strcase path)) (findfile prepared))
    (vl-file-delete prepared))
  (cond
    ((not root)
      (sartd:json-log (if sartd:*json-error* sartd:*json-error* "JSON parse failed."))
      nil)
    ((sartd:v117-json-key-envelope-p root)
      (sartd:json-log
        "This is the AutoCAD key/contract JSON, not a drawing case. Select the numbered trailer-stability-autocad-######.json case-data file instead.")
      nil)
    ((sartd:v116-saved-project-json-p root)
      (sartd:json-log
        "This is a saved project JSON, not the coded AutoCAD drawing export. In Trailer Stability use AutoCAD > Export drawing data, then select the numbered TRAILER-STABILITY-CAD-DATA JSON file.")
      nil)
    (T
      (setq verdict (sartd:json-validate root))
      (if (not (car verdict))
        (progn (foreach e (cadr verdict) (sartd:json-log e)) nil)
        (progn
          (setenv "SARTD_JSON_LAST" path)
          (setq sartd:*json-root* root sartd:*json-data* (sartd:json-adapt root))
          (sartd:json-log
            (strcat "Validated numbered case export: "
                    (itoa (length (sartd:g 'trailers sartd:*json-data*))) " trailer(s), "
                    (itoa (length (sartd:g 'hydraulic-grouping sartd:*json-data*))) " hydraulic side definition(s), "
                    (itoa (length (sartd:g 'json-polygon sartd:*json-data*))) " stability-boundary point(s)."))
          sartd:*json-data*)))))

(defun c:SARTDJSONDATA (/ path data)
  (vl-load-com)
  (setq path (sartd:v117-json-last-source-path))
  (if path
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn (sartd:json-summary data) (sartd:json-log "SARTDJSONDATA complete."))
        (sartd:json-log "SARTDJSONDATA stopped before drawing."))))
  (princ))

(defun c:SARTDJSON (/ path data result)
  (vl-load-com)
  ; This interactive command always opens the picker. Automated checks use SARTDJSONDATA instead.
  (setq path (sartd:v117-json-prompt-source-path))
  (if (and path (/= path ""))
    (progn
      (setq data (sartd:json-load-validated path))
      (if data
        (progn
          (sartd:json-summary data)
          (setq result (vl-catch-all-apply 'sartd:json-run-drawing (list data)))
          (if (vl-catch-all-error-p result)
            (sartd:json-log (strcat "SARTDJSON failed safely: " (vl-catch-all-error-message result)))
            (if result
              (sartd:json-log "SARTDJSON complete.")
              (sartd:json-log "SARTDJSON stopped; no drawing was committed."))))
        (sartd:json-log "SARTDJSON stopped before drawing.")))
    (sartd:pr "No numbered case-data JSON was selected; SARTDJSON stopped."))
  (princ))

(princ
  (strcat
    "\nSARENS_TRAILERDRAFTSMAN v" sartd:*version* " final overrides loaded."
    " Active discovers visible Excel workbooks and captures current in-memory values."
    " SARTDJSON always prompts for the numbered case-data JSON; SARTDJSONDATA reuses the last validated case."))
(princ)
