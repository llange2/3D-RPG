; Extra page and shortcuts of the installer: the player chooses whether the game gets a Start menu entry (default: yes) and a desktop icon (default: no).
; electron-builder creates no shortcuts itself (`createStartMenuShortcut` / `createDesktopShortcut` are off in build.mjs), the macros below do.
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Var MM3_StartMenuCheck
  Var MM3_DesktopCheck
  Var MM3_WantStartMenu
  Var MM3_WantDesktop

  ; a silent install (/S) shows no page: it keeps these defaults
  !macro customInit
    StrCpy $MM3_WantStartMenu ${BST_CHECKED}
    StrCpy $MM3_WantDesktop ${BST_UNCHECKED}
  !macroend

  Function MM3ShortcutsPageCreate
    ; the installer follows the language of the system (electron-builder): German and English are written out, everything else gets English
    ${If} $LANGUAGE == 1031
      StrCpy $R0 "Verknüpfungen"
      StrCpy $R1 "Wählen Sie, wo ${PRODUCT_NAME} gestartet werden kann."
      StrCpy $R2 "Welche Verknüpfungen soll die Installation anlegen?"
      StrCpy $R3 "&Startmenü-Verknüpfung anlegen"
      StrCpy $R4 "&Desktop-Verknüpfung anlegen"
    ${Else}
      StrCpy $R0 "Shortcuts"
      StrCpy $R1 "Choose where ${PRODUCT_NAME} can be started from."
      StrCpy $R2 "Select the shortcuts the installer should create:"
      StrCpy $R3 "Create a &Start menu shortcut"
      StrCpy $R4 "Create a &desktop shortcut"
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$R0" "$R1"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "$R2"
    Pop $0

    ${NSD_CreateCheckbox} 0 34u 100% 12u "$R3"
    Pop $MM3_StartMenuCheck
    ${If} $MM3_WantStartMenu == ${BST_CHECKED}
      ${NSD_Check} $MM3_StartMenuCheck
    ${EndIf}

    ${NSD_CreateCheckbox} 0 52u 100% 12u "$R4"
    Pop $MM3_DesktopCheck
    ${If} $MM3_WantDesktop == ${BST_CHECKED}
      ${NSD_Check} $MM3_DesktopCheck
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function MM3ShortcutsPageLeave
    ${NSD_GetState} $MM3_StartMenuCheck $MM3_WantStartMenu
    ${NSD_GetState} $MM3_DesktopCheck $MM3_WantDesktop
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom MM3ShortcutsPageCreate MM3ShortcutsPageLeave
  !macroend

  !macro customInstall
    ${If} $MM3_WantStartMenu == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}
    ${If} $MM3_WantDesktop == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  !macro customUnInstall
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  !macroend
!endif
