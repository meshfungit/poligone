\# AGENTS.md for poligone



\## Project role



This repository is edited on Windows.



Primary repository path:



E:\\proj\\git\_world\\poligone



Runtime and tests are performed on Orange Pi Linux.



Remote host alias:



mailedge



Remote runtime directory:



/home/adminus/projects/poligone-test



The Orange Pi is only a runtime/test target.



\## General rules



Work only inside this repository unless explicitly instructed otherwise.



Do not create commits automatically.



Do not push to any remote repository.



Do not edit operating system configuration files.



Do not run destructive commands.



Do not make broad refactoring changes unless explicitly requested.



Do not replace working architecture based on assumptions.



Prefer small, reviewable patches.



Before changing code, inspect the actual current file contents.



If the current file contents are unknown or stale, ask for the actual file or re-read it.



\## Forbidden commands



Do not run:



\- git commit

\- git push

\- sudo

\- systemctl

\- service

\- reboot

\- shutdown

\- rm -rf

\- del /s /q

\- rmdir /s /q



\## Forbidden paths



Do not edit:



\- /etc/reticulum

\- /etc/reticulum-rttr

\- /etc/systemd/system

\- /etc/nginx

\- /etc/sudoers

\- /etc/sudoers.d

\- \~/.reticulum/config

\- C:\\Windows

\- C:\\Program Files

\- C:\\Program Files (x86)



\## Remote runtime rules



Remote target:



mailedge:/home/adminus/projects/poligone-test



Allowed remote use:



\- copy the project to the remote runtime directory;

\- run application tests from the remote runtime directory;

\- collect stdout, stderr and logs from test runs.



Do not modify remote system configuration.



Do not install packages on the remote host unless explicitly requested.



Do not use sudo on the remote host.



Do not edit files outside:



/home/adminus/projects/poligone-test



\## Preferred test workflow



1\. Edit files locally on Windows.

2\. Show the changed files.

3\. Sync the working tree to mailedge.

4\. Run the test command on mailedge from /home/adminus/projects/poligone-test.

5\. Report the exact command, exit code and relevant output.

6\. Do not commit.



\## Reticulum desktop chat debugging goal



The current task is debugging a Reticulum desktop chat.



Before making changes, identify:



\- application entry point;

\- Reticulum/RNS initialization;

\- LXMF initialization, if present;

\- identity creation and loading;

\- destination creation;

\- announce logic;

\- message send path;

\- message receive path;

\- UI update path;

\- config storage;

\- message/contact/user storage.



\## Debug logging rules



For temporary debug logging, prefer structured logs.



Useful fields:



\- timestamp;

\- direction: inbound or outbound;

\- identity hash;

\- destination hash;

\- peer hash;

\- message id, if present;

\- path availability;

\- send result;

\- receive callback name;

\- UI delivery point;

\- exception type and message.



Keep debug patches minimal.



Do not leave noisy debug logs enabled by default unless explicitly requested.



\## Python code rules



Do not hardcode default values inside functions when they can be module-level constants.



Put reusable defaults near the top of the file.



Prefer complete-function replacements over tiny ambiguous edits.



For partial edits, use clearly bounded blocks.



Avoid unrelated formatting-only changes.



Avoid PEP8-only rewrites unless explicitly requested.



\## Patch reporting



After each change, report:



\- exact files changed;

\- exact purpose of the change;

\- how to test it;

\- whether the change is temporary or permanent.



Do not say a test passed unless it was actually run.

