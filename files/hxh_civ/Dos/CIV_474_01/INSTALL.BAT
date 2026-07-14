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
echo Insert disk labelled "1" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV
copy civ.bat %1\MPS

cls
echo Insert disk labelled "2" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Insert disk labelled "3" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Insert disk labelled "4" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Insert disk labelled "5" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Insert disk labelled "6" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End

cls
echo Insert disk labelled "7" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

if EXIST %1\mps\civ\BIRTH0.PAL goto End
cls
echo Insert disk labelled "8" into your floppy disk drive, then...
PAUSE
copy *.* %1\MPS\CIV

cls
:End
echo INSTALL FINISHED

