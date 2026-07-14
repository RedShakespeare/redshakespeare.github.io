echo off
REM this program installs CIVILIZATION from floppies to %1\MPS\CIV

if not %1=="" goto OK1
echo ERROR: No disk specified, use INSTALLC or INSTALLD or INSTALLE
goto End
:OK1

if not EXIST %1\MPS\CIV\BIRTH0.PAL goto OK2
del %1\MPS\CIV\BIRTH0.PAL
:OK2

REM  this installs new CIV subdirectory; errorlevel 0 means success
MD %1\MPS
MD %1\MPS\CIV
if errorlevel 0 goto CopyFiles
cls
echo Error creating %1\MPS\CIV subdirectory, do not use INSTALL program.
echo You must install CIVILIZATION manually. Sorry. 
goto End

:CopyFiles
REM  this copies files from floppies in to %1\MPS\CIV

cls
echo Bitte Diskette "1" einlegen ...
PAUSE
copy *.* %1\MPS\CIV
copy civ.bat %1\MPS

cls
echo Bitte Diskette "2" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Bitte Diskette "3" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Bitte Diskette "4" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Bitte Diskette "5" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Bitte Diskette "6" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Bitte Diskette "7" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End
cls
echo Bitte Diskette "8" einlegen ...
PAUSE
copy *.* %1\MPS\CIV

cls
:End
echo INSTALL FINISHED

