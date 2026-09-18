' Chay run.bat trong CUNG thu muc, AN hoan toan cua so cmd (khong hien, khong
' co icon taskbar), chuyen tiep nguyen ven moi tham so dong lenh nhan duoc.
' Dung Chr(34) de tu bao boc tung tham so trong dau ngoac kep — an toan hon
' nhieu so voi viec sinh cu phap VBS tu ben trong batch bang lenh echo (de vo
' vi ky tu dac biet/dau ngoac kep long nhau).
Dim sh, fso, dir, cmd, i

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)

' Luu y quan trong: "cmd.exe /c" co 1 quy tac ngam dinh KHI toan bo chuoi
' lenh sau /c bat dau VA ket thuc bang dau ngoac kep — no se tu y BOC 2 dau
' ngoac kep NGOAI CUNG do (khong phai cua rieng token dau/cuoi), lam sai lech
' toan bo cach tach tham so ben trong (da kiem chung thuc te: mat token dau
' tien). Cach sua chuan: bao boc THEM 1 lop ngoac kep quanh TOAN BO chuoi
' lenh (sau "/c "), de lop bi bot di chi la lop du ta them vao.
cmd = "cmd.exe /c " & Chr(34) & Chr(34) & dir & "\run.bat" & Chr(34) & " /HIDDEN"
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & " " & Chr(34) & WScript.Arguments(i) & Chr(34)
Next
cmd = cmd & Chr(34)

sh.CurrentDirectory = dir
sh.Run cmd, 0, False
