# Troubleshooting Guide

## File Watcher Limit Error (ENOSPC)

If you encounter the error:
```
Error: ENOSPC: System limit for number of file watchers reached
```

This happens when the Linux inotify file watcher limit is too low. The current limit is 65536, which may not be enough for large projects.

### Solution 1: Increase System Limit (Recommended)

Run these commands (requires sudo):

```bash
# Check current limit
cat /proc/sys/fs/inotify/max_user_watches

# Increase limit temporarily (until reboot)
sudo sysctl fs.inotify.max_user_watches=524288

# Make it permanent
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Solution 2: Exclude Directories from Watching

The project is already configured to exclude `.pnpm-store` and `node_modules` from file watching. If you still encounter issues, you can:

1. Move `.pnpm-store` outside the project directory
2. Use `pnpm store path` to check store location
3. Configure pnpm to use a different store location

### Solution 3: Run Tests Without Watch Mode

If you just need to run tests once:

```bash
pnpm test:run
```

This runs tests once without file watching (no watch mode).

