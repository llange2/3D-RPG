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
  ; What happens to the player's achievements and save games (release 1.2): they live in the data folder of the Windows user who plays (`%APPDATA%\MM3 Seed RPG`, see
  ; `app.setPath("userData")` in main.mjs), so the question concerns the user who runs the uninstaller. Default: keep. A silent uninstall (/S, and the one an update
  ; runs) shows no page and keeps them; `--delete-app-data` on the command line of a silent uninstall removes them (electron-builder's own switch, handled in its uninstaller).
  Var MM3_KeepRadio
  Var MM3_AllRadio
  Var MM3_RemoveAll

  !macro customUnInit
    StrCpy $MM3_RemoveAll 0
  !macroend

  Function un.MM3DataPageCreate
    ${If} $LANGUAGE == 1031
      StrCpy $R0 "Spielstände und Achievements"
      StrCpy $R1 "Wählen Sie, was mit Ihren Daten geschieht."
      StrCpy $R2 "Was soll mit den Spielständen und Achievements dieses Windows-Benutzers geschehen?"
      StrCpy $R3 "Achievements und Spielstände behalten (Standard)"
      StrCpy $R4 "Alles entfernen"
      StrCpy $R5 "Deinstallieren"
    ${Else}
      StrCpy $R0 "Achievements and save games"
      StrCpy $R1 "Choose what happens to your data."
      StrCpy $R2 "What should happen to the achievements and save games of this Windows user?"
      StrCpy $R3 "Keep achievements and save games (Default)"
      StrCpy $R4 "Remove everything"
      StrCpy $R5 "Uninstall"
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$R0" "$R1"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "$R2"
    Pop $0

    ; (this NSIS has no First/AdditionalRadioButton: the first radio button starts the group by its style)
    ${NSD_CreateRadioButton} 0 34u 100% 12u "$R3"
    Pop $MM3_KeepRadio
    ${NSD_AddStyle} $MM3_KeepRadio ${WS_GROUP}
    ${NSD_CreateRadioButton} 0 52u 100% 12u "$R4"
    Pop $MM3_AllRadio
    ${If} $MM3_RemoveAll == 1
      ${NSD_Check} $MM3_AllRadio
    ${Else}
      ${NSD_Check} $MM3_KeepRadio
    ${EndIf}

    ; this page is the last one before the files go: its button says so
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$R5"

    nsDialogs::Show
  FunctionEnd

  Function un.MM3DataPageLeave
    ${NSD_GetState} $MM3_AllRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $MM3_RemoveAll 1
    ${Else}
      StrCpy $MM3_RemoveAll 0
    ${EndIf}
  FunctionEnd

  ; the page replaces nothing: it comes after the default welcome page, before the files are removed
  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.MM3DataPageCreate un.MM3DataPageLeave
  !macroend

  !macro customUnInstall
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    ${If} $MM3_RemoveAll == 1
      ; the data of the Windows user who plays, whatever the install mode (an installation for all users writes into the profile of each user who starts the game)
      ${If} $installMode == "all"
        SetShellVarContext current
      ${EndIf}
      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  !macroend
!endif
