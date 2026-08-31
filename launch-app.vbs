' Launches Olympiad Trail as a standalone app window.
'
' 1. Closes any window left open from a previous launch, so they don't
'    pile up on the taskbar.
' 2. Rebuilds the app (fast, ~1s) so it always shows the latest content.
' 3. Starts (or reuses) a small local preview server for the build.
'    (file:// can't be used directly: Chromium blocks ES module scripts
'    loaded from the file:// origin, which would render a blank window.)
' 4. Opens it in a chrome-less "app mode" window (Edge or Chrome), or
'    falls back to the system default browser.
'
' The URL includes a timestamp so every launch is treated as a distinct
' navigation. Without this, Edge/Chrome's --app mode just focuses whatever
' window was already open from an earlier launch instead of reloading it,
' so a kid re-opening the icon would keep seeing stale, already-loaded
' content (e.g. an old question count) even after the app changes.

Dim shell, fso, projectDir, url
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:4173/?launched=" & CStr(DateDiff("s", "01/01/2020", Now()))

' --- close any window left open from a previous launch ---
shell.Run "cmd /c taskkill /F /FI ""WINDOWTITLE eq Olympiad Trail""", 0, True

' --- rebuild so the app always shows the latest content ---
shell.Run "cmd /c cd /d """ & projectDir & """ && npm run build", 0, True

' --- start (or reuse) the local server ---
' Fire-and-forget: if a server from a previous launch is already serving on
' this port, this attempt just exits immediately and the old one keeps working.
shell.Run "cmd /c cd /d """ & projectDir & """ && npm run preview -- --port 4173 --strictPort", 0, False
WScript.Sleep 1500

Dim candidates(3)
candidates(0) = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
candidates(1) = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
candidates(2) = "C:\Program Files\Google\Chrome\Application\chrome.exe"
candidates(3) = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

Dim browserPath, i
browserPath = ""
For i = 0 To 3
  If browserPath = "" And fso.FileExists(candidates(i)) Then
    browserPath = candidates(i)
  End If
Next

If browserPath <> "" Then
  shell.Run """" & browserPath & """ --app=""" & url & """", 1, False
Else
  shell.Run url, 1, False
End If
