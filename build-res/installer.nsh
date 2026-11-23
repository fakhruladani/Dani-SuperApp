; Included by electron-builder (package.json -> build.nsis.include).
;
; Updates failed with "Failed to uninstall old application files ... : 2": the old version was still
; running (it lives in the tray and starts with Windows) and its files were locked, so the old
; uninstaller could not remove them. electron-builder's own check only finds processes started from
; the folder chosen in this installer ($INSTDIR); an app running from another folder, or one that is
; still shutting down after "Pasang & mulai ulang", slipped through.
; Here: close every process of the app by its file name, wherever it runs from. Called right before
; the old version is removed (after the user clicked Install), and when uninstalling.
; No taskkill /T: during an in-app update this installer was started by the app, and /T would end it too.

!macro dsaCloseApp
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  ${if} $0 == 0
    DetailPrint `Closing "${PRODUCT_NAME}"...`
    ; give Windows a moment to release the file handles
    Sleep 2000
  ${endIf}
!macroend

!macro customCheckAppRunning
  !insertmacro dsaCloseApp
!macroend

!macro customUnInit
  !insertmacro dsaCloseApp
!macroend
