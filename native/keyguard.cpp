#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstdlib>

static HANDLE parentProcess = nullptr;
static HHOOK keyboardHook = nullptr;
static bool blockedF4 = false;
static LRESULT CALLBACK keyboardEvent(int code, WPARAM message, LPARAM payload) {
  if (code == HC_ACTION) {
    const auto* key = reinterpret_cast<KBDLLHOOKSTRUCT*>(payload);
    if (key->vkCode == VK_F4) {
      const bool down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
      const bool up = message == WM_KEYUP || message == WM_SYSKEYUP;
      if (down && (key->flags & LLKHF_ALTDOWN)) {
        if (!blockedF4) { std::puts("BLOCKED"); std::fflush(stdout); }
        blockedF4 = true;
        return 1;
      }
      if (up && blockedF4) { blockedF4 = false; return 1; }
    }
  }
  return CallNextHookEx(keyboardHook, code, message, payload);
}
static void CALLBACK checkParent(HWND, UINT, UINT_PTR, DWORD) {
  if (WaitForSingleObject(parentProcess, 0) != WAIT_TIMEOUT) PostQuitMessage(0);
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  char* end = nullptr;
  const unsigned long pid = std::strtoul(argv[1], &end, 10);
  if (!pid || !end || *end) return 2;
  parentProcess = OpenProcess(SYNCHRONIZE, FALSE, static_cast<DWORD>(pid));
  if (!parentProcess) return 3;
  keyboardHook = SetWindowsHookExW(WH_KEYBOARD_LL, keyboardEvent, GetModuleHandleW(nullptr), 0);
  const UINT_PTR timer = SetTimer(nullptr, 0, 1000, checkParent);
  if (!keyboardHook || !timer) {
    if (keyboardHook) UnhookWindowsHookEx(keyboardHook);
    CloseHandle(parentProcess);
    return 4;
  }
  std::puts("READY"); std::fflush(stdout);
  MSG message;
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message); DispatchMessageW(&message);
  }
  KillTimer(nullptr, timer);
  UnhookWindowsHookEx(keyboardHook);
  CloseHandle(parentProcess);
  return 0;
}
