@echo off
rem Run this ONCE as administrator (right-click -> Run as administrator)
rem It allows a phone on the same Wi-Fi to reach Tik's Career Board on port 3809.
netsh advfirewall firewall add rule name="Tiks Career Board (port 3809)" dir=in action=allow protocol=TCP localport=3809 profile=private
echo.
echo Done! On the phone (same Wi-Fi) open:  http://192.168.0.5:3809
echo (If your PC's IP changes, run:  ipconfig  and use the IPv4 address shown)
pause
