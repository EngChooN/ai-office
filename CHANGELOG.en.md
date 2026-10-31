# What's New

The app's "What's New" screen shows this file as is. It is written **so that someone with no development background can read it and understand right away**.

Writing rules
- For each version, write under `## [version] - date`, divided into `### New features` / `### Improvements` / `### Bug fixes`.
- Write from the user's point of view, describing "what you can now do." Do not use technical names (file paths, program or library names, English abbreviations). If one is truly needed, put it once in parentheses after a plain-language explanation.
- Development details (how it was built, where files are) go in `SPEC.md` and `docs/changelog-dev.md`.

## [미정] (설치본 미빌드)

## [0.16.3] - 2026-10-31

### New features
- When you send an instruction in a chat room, a per-staff status line (waiting / working / needs your check / error, N waiting) now shows in that room and in the Tasks tab of the staff panel until the reply arrives.
- You can pick @ suggestions in the chat room with the keyboard: ↑↓ to move, Enter or Tab to select, Esc to close.

### Improvements
- After you pick an @ suggestion, the cursor stays in the input box so you can keep typing right away.
- The status line no longer overflows on narrow screens, and long names and statuses are shortened.

### Bug fixes
- If a staff member hits an error while working, the chat room is told and the remaining instructions are cleared. A connection that drops while the staff member is idle is not reported.

## [0.16.2] - 2026-10-30

### Improvements
- Polished the Android phone screens. Header icon buttons and the send button are now round, and in portrait the Demo Day dialogue box sits below the stage with the reaction buttons at the bottom of the screen.
- Answer and approval buttons now wrap in narrow spaces, so no horizontal scrollbar appears on a phone turned sideways or in a small PC window.
- The phone's staff panel no longer has a height handle for the approvals section and shows only as much as the content needs.
- @names are now highlighted in the group chat input box and speech bubbles.

### Bug fixes
- Fixed replies being lost when you sent an @name instruction in the group chat while that staff member was working. The reply now arrives in the room the instruction was sent from (including team and lab rooms), even after the earlier task finishes.

## [0.16.1] - 2026-10-30

### New features
- Every team and every lab now has its own chat room. In the group chat you can pick the All room, a team room or a lab room, and results of work assigned in a team or lab room come back to the same room. The All room folds new posts from other rooms into one line, and clicking it opens that room. You can open them from the team cards and lab cards in the org chart.
- Autonomous mode. Turn on "Autonomous" per task and staff will carry it through to the end without asking. Auto-approval also gets a "Full autonomy" level that applies to all staff. Risky actions are refused instead of going to the approvals inbox and are left as "Needs your confirmation." You can turn it on only from the PC; the phone can only turn it off.
- The staff market now has Designer, Customer Support (CS) and Marketer. Their staff art was redrawn to match each role.
- Staff cards show the number of unread reports as a badge. Opening the staff panel clears it.
- When you speak to a staff member directly, their pending approvals are closed as "Withdrawn." When the same staff member posts a new text question, the earlier one is closed as "Replaced."
- Questions you have already answered are saved to the knowledge base as "Decisions," and if the same question comes again within 30 days it is answered automatically with the earlier answer. Which answer was followed is recorded in the history.
- In the staff panel you can send just by choosing a manual, with no extra message.
- On the outdoor (street) screen you can now zoom with the wheel or pinch and drag to move around, like inside the building. There are also zoom in, zoom out and show-all buttons.

### Improvements
- The sidebar menu shrank from 16 items to 10 groups, and similar screens moved into tabs at the top of the screen. Each group remembers the tab you viewed last, and the phone's More menu uses the same groups. "Payslips" is now called "Costs."
- While a new version downloads, the progress shows inside the "Update now" button, and the button is locked meanwhile.
- The group chat no longer cuts completion reports short with "…"; the full text is saved. Long speech bubbles show 12 lines and expand with "Show more" and "Collapse" buttons.

### Bug fixes
- Fixed a vertical scrollbar appearing on the tab bar at the top.
- Fixed names and numbers overflowing their boxes in the dashboard summary cards.
- Fixed the outdoor screen's building size suddenly jumping with the window shape. A drag that ended on a building is no longer counted as entering it.

## [0.16.0] - 2026-10-30

### New features
- New app icon and tray icon. Mac, Windows and Android all use the same new icon.
- Staff have a new look. The same new staff members appear on the map, staff cards, the decorating preview and Demo Day. Sitting and typing poses were redrawn too.
- Emotion bubbles above staff were redrawn as new pixel art, with new 👀, 👍, ☕ and ? bubbles.
- 7 new ways staff interact: handing over a task, looking over a shoulder at results, helping a stuck coworker, high-fives when work is done, chatting about recent work in the lounge, coffee runs, and waving when you click a staff member. These are visual only and do not affect real work.
- New furniture has been added.
- New buildings and scenery around the building exterior.
- You can drag the approval section of the staff panel to change its height, and fold or unfold it.

### Improvements
- Settings, the staff panel and the sidebar now fit better on narrow windows.
- The focus outline of the selected field looks the same across the whole app.
- Partitions next to desks now connect, and desks are drawn to face the seated staff member.
- The introduction site's text, screenshots and videos were refreshed.

### Bug fixes
- Fixed staff export failing when a role was longer than 40 characters. Up to 200 characters are accepted now, and the error message shows the staff name and the limit.
- Fixed lab export failing when the name or goal was too long. The input boxes now have limits, and values that are already too long are trimmed when exporting.
- Fixed the input box at the bottom of the staff panel being cut off in small windows.

## [0.15.1] - 2026-10-29

### Bug fixes
- Fixed the Android app suddenly closing when you opened the photo picker to attach a picture. The error happened when the live connection closed the moment the picker covered the app.
- Fixed the focus outline of the input box in the staff chat looking doubled when selected. Now only the outer border is highlighted.

### Improvements
- Differences by device: the Android fix applies only to the phone app. The PC app only gets the input outline fix.

## [0.15.0] - 2026-10-29

### New features
- Six color themes were added: Lavender, Sky, Sunset, Moss, Blossom, and Mono. Pick one in Settings. Only the button and highlight colors change; the layout stays the same.
- You can now choose the appearance: Match device, Light, or Dark. With Match device, the app follows your device as soon as it changes. The Windows title bar and window background follow the same mode. This is separate from the day/night look of the office scene.
- The Settings screen now has categories on the left (General, AI & work, Office, Connections), and the right side shows only the items in the chosen category. On phones they appear as tabs across the top.
- Staff whose role you typed yourself in the Hire window (up to 40 characters) can now be exported to and imported from a staff pack.

### Improvements
- Buttons are now pill-shaped, cards are rounder with softer shadows, inputs highlight their border when selected, and the background behind dialogs is blurred.
- Fixed colors that were hard-coded in many screens (black, white, blue, yellow) now use the theme colors. Badges, office hover tips, and shop rarity labels stay readable in Light mode too.
- The arrow on dropdown menus is now drawn inside the border instead of touching its edge.
- Every screen now has generous space at the bottom so the last card no longer sticks to the edge of the window.
- Reduced the flash of a dark screen when the app starts. It is now painted with your saved mode and theme from the start.
- Differences by device: color themes and appearance can only be changed on the PC. In the phone app these choices are locked and a note says 'You can change this on the PC.' The phone screen follows the mode and theme chosen on the PC.
- Please note: the look of the office scene (floor, furniture, day/night) does not change with the appearance or color theme. The office theme and day/night settings remain separate.
- Please note: the Windows zip file is still not published. If you used the old zip app, download Setup.exe from the Release page, install it, and then delete the old folder. Your settings and history carry over.
- Please note: the Windows installer is not signed, so a warning window (SmartScreen) appears the first time you open it. Click "More info › Run anyway."

### Bug fixes
- Fixed content near the corners looking clipped when hovering over a rounded card.
- Fixed staff with a self-typed role being rejected as an 'unknown role' when exporting to or importing from a staff pack.

## [0.14.4] - 2026-10-29

### New features
- A Windows installer (Setup.exe) is now available. It installs into your user folder and adds Start menu and desktop shortcuts. No admin rights are needed.
- Floor-specific stair graphics were added. The ground floor shows stairs going up, the top floor shows stairs going down (with an opening and railing), and middle floors show stairs going both ways.

### Improvements
- The plan usage in the top bar now shows Claude and GPT together. If you use both engines, each one is labeled, and the text is shortened with an ellipsis in narrow windows.
- In-app updates on Windows now download and run the installer (Setup.exe). When the installation finishes, the new version opens automatically.
- Windows users who ran the app from an unzipped folder now see a notice in the update window that the app is switching to the installed version. Your settings and history carry over, and you can delete the old folder afterward.
- README, the introduction site, and the distribution docs were updated for the installer.
- Please note: the Windows zip file is no longer published starting with this version. If you used the old zip app, download Setup.exe from the Release page, install it, and then delete the old folder. Your settings and history carry over.
- Please note: the installer is not signed, so a warning window (SmartScreen) appears the first time you open it. Click "More info › Run anyway."

### Bug fixes
- Fixed the GPT secretary stopping after only saying "Let me check." If a turn ends without a final answer, it now continues in the same conversation and writes the answer.
- Fixed the app not reopening after an update on Windows, and the update window appearing again and again. The installer now installs and opens the new version.
- Corrected the section titles in the 0.14.3 Chinese changelog.

## [0.14.3] - 2026-10-29

### New features
- You can export the office scene from the PC app. Save the office screen as a picture (PNG) or as a 10-second animated GIF, and choose whether to hide speech bubble text.
- The feedback button in the sidebar opens a GitHub issue form with your app version and operating system already filled in.
- The first-run guide has been redesigned. At the last step, a sample task is actually given to one staff member and the result is checked. If it fails, the app explains the cause (sign-in, usage limit, timeout, or network). If you skip it, a practice tutorial guides you. If you don't have Claude, the setup continues with GPT.
- You can choose the AI engine (Claude or GPT) in the hire window and the staff marketplace. Recommended engines for each job are shown.
- The introduction site now opens in English, Japanese, and Chinese. It is also organized to appear better in search.
- You can open the staff marketplace in the phone app. Go straight in from the hire window button. If you have no staff yet, a notice appears. A notice also appears on first launch. Importing and exporting packs can only be done on the PC.
- A demo day banner appears on the screen. Tap "Open now" to go straight into the presentation hall.
- You can change the AI (Claude or GPT) that a staff member uses, later on.

### Improvements
- The level-up celebration window no longer pops up over the first-run guide or the tutorial.
- If the PC app is an older version, the phone shows an update notice.
- "Undo work" is hidden on the phone. Please undo on the PC.
- On the phone, PC-only settings show their current status only.

### Bug fixes
- Fixed a problem where "Undo work" on the PC got stuck at "Processing" when the undo failed.

## [0.14.2] - 2026-10-28

### New features
- You can ask the secretary to hire GPT staff. On the hiring card, choose Claude or GPT as the AI engine, and the app checks right away that the model matches the engine.
- "Continue in terminal" for GPT staff now opens with the Codex tool installed on your computer. If Codex is not installed, the app shows install instructions.

### Improvements
- GPT staff follow the same tool limits as Claude staff. Web search is blocked, dangerous commands do not run, and shell commands ask for approval in the approval inbox before they run.
- Bringing in outside sessions, hiring from the phone, and export/import keep each staff member's engine (Claude or GPT).
- When a plan limit is reached, the pause and the notice are handled separately for each engine.
- Codex outside sessions now show "What I did today." The equipment list can be refreshed.
- If you use only Codex, the wording, onboarding and usage card are shown the same way regardless of engine. Empty Claude sections are hidden when you use only Codex.

### Bug fixes
- Fixed the remaining time in usage showing wrongly as "1 hour 60 minutes."
- Staff whose engine and model did not match are now corrected automatically when they are turned on.

## [0.14.1] - 2026-10-28

### Improvements
- In meetings, meeting minutes, task delegation decisions and Demo Day, each staff member now speaks with its own AI (Claude or GPT). If that AI is not connected, the app's default AI speaks instead, and the meeting record shows that this happened.

### Bug fixes
- After the secretary finishes an answer, it no longer shows "stopped" or "could not answer" by mistake when a cost or turn limit is reached.

## [0.14.0] - 2026-10-27

### New features
- **The app is now called 'AI Office'.** Staff, records and settings are copied over automatically the first time you open it. The old folder is left as it is.
- **You can hire GPT staff (beta).** When you hire, choose whether the staff member is a Claude or a GPT staff member.
- **You can connect your Claude and GPT accounts separately in Settings.** You can start with just one connected.
- **You can choose which AI the built-in helpers (secretary, summaries) use.**
- **You can see GPT usage next to Claude usage.**
- **GPT work running in a terminal now shows as "working".**
- **The phone's QR scanner is easier to use.** You can pick a photo or paste an image instead of using the camera, and tap to focus and zoom.
- You can give staff a 'computer control' equipment. Equipped staff can look at your screen and work with the mouse and keyboard. Viewing the screen needs no approval; mouse and keyboard actions need approval in the approval inbox.
- **You can place a desk from the shop at a staff member's seat, or remove it.**
- **You can rotate a staff desk set (desk + chair) with the R key or right-click while decorating.**
- **You can buy 20 new furniture and decor items at levels 11 to 20.** Two unlock at each level, and the number of floors does not change. From level 15, each level has one legendary item.

### Improvements
- **GPT costs are calculated with OpenAI's official prices.**
- **The install files are larger because GPT staff support is included.**
- **When you assign work to a staff member on another floor, they return to their own floor to work.**
- **You can click desks while decorating.**
- **Appearance changes show on screen right away.**
- **You can select furniture that overlaps.**

### Bug fixes
- **If the provider status check takes too long, it shows "unknown" and keeps the previous status.**
- **Stopping a GPT staff member no longer leaves its waiting approvals behind.**
- **Fixed GPT work in a terminal not showing as "working" right away.**
- **Fixed old records and approval messages staying in the old language after you change the language.**
- **The office screen now moves or pauses correctly to match the window, even after the screen is reloaded.**
- **The next instruction no longer gets stuck when a staff setting arrives with a missing value.**
- **A moved desk set stays where you moved it.**
- **Demo Day runs to the end, and the finished state is kept after restarting the app.**

## [0.13.1] - 2026-10-27

### New features
- **You can now connect to your PC from your phone outside your home or office.** No router port needs to be opened; it uses Tailscale (a private network).
- **New "Allow staff screen capture" setting.** It is on by default, so staff attach screenshots when they report results. When it is off, only staff who were given the equipment can capture.

### Improvements
- **Staff are asked to capture the result screen in every task report.** This applies to tasks you assign directly, tasks handed to a team lead, and subtasks in plans.
- **The presenter screen moved to the back wall and now uses a 16:10 ratio.**
- **On the demo day stage, you can use "Next line" and "View screen larger".** Close the enlarged view by clicking it or pressing Esc.
- **When you scroll up in the chat and new messages arrive, a "N new" count and a "Jump to latest" button appear.**
- **You can still undo the last task after restarting the app.** The pre-work state is saved.
- **If files changed while the app was closed, you are told that undo is not safe.**
- **In the gallery, open the full result and click a screenshot to view it larger.**
- **Notification messages and the on/off switch look cleaner.**

### Bug fixes
- **Fixed the result window covering the "Review complete" highlight in the last tutorial step.**

## [0.13.0] - 2026-10-27

### New features
- **Update the app from inside the app.** When a new version comes out, press "Update now" and the app downloads it, installs it, and reopens by itself. Before installing, the app briefly closes, and staff who are working pause. You are told this first.
- **"Always approve" lets matching requests go through automatically.** Create a rule from an approval card, and the same kind of request won't ask you again. Risky commands and anything that sends data outside can't be turned into rules. You can review and delete rules in Settings.
- **Revert changed files in one step.** Before a staff member starts a new job, the app remembers the current state and shows how many files changed. Press "Revert to before the task" to restore the files they changed. Files that another staff member also edited are left alone.
- **Launch automatically when you log in.** Turn it on in Settings and the app starts quietly, without a window, when you log in. On Windows, a window appears only if the notification area icon is turned off.
- **Result gallery and Demo Day.** Finished work gathers in a gallery you can filter by period, staff member, or lab. Demo Day runs on a set day and time, and you can also open it anytime with "Open Demo Day now" (or /demoday in the group chat). It moves to a presentation hall, where each staff member walks from the audience to the podium and presents briefly with photos of their work, followed by applause. For each presentation you can react with 👏 applause, 🏆 MVP of the day (one per Demo Day), or 💬 a short comment. Applause and MVP stay on the staff card as praise badges, and comments are saved to the company knowledge store. A summary is posted to the group chat afterward. On your phone you can watch the meeting record instead of the hall. Turn off AI presentations and it uses 0 tokens.
- **A company knowledge store.** Lessons learned by staff, feedback on plans, and decisions made in meetings are saved automatically. When a new task starts, the three most relevant items are passed along with the instructions. You can browse, search, edit, and delete them by type.
- **Export and import staff and labs as files.** Save several staff members and a lab setup into one file, and import it on another computer. Work folders and reference documents are not included. Imports are checked first; if there is a problem, you are shown the reason and nothing is created.
- **Hire from the staff market.** From "Staff Market" at the top of the hiring window, pick one of six ready-made staff and hire them right away.
- **Limit phone connections to "same network only".** When on, phones connect only over the same Wi-Fi or company VPN, and no router port is opened. It is on by default for new installs, and existing users are asked once on first launch. If you turn it on and later off, you need to scan the QR code again on your phone to connect from outside. The Android app supports this mode too.
- **Finish the tour and pick "Try one full cycle" to practice hands-on.** Choose "Assign a task" (post a card, approve the plan, get the result) or "Hold a meeting" (hear opinions and turn decisions into task cards) and try it in a practice company. Practice staff don't use AI, and you can skip straight to hiring real staff. Practice records are cleared automatically when you hire your first real staff member.
- **Add connectors from a staff member's Equipment tab.** You can add and edit them only on this computer, not from your phone.
- **Ask the secretary to tidy your task board.** It proposes closing old cards, merging cards with the same title, setting teams and labs, and fixing statuses in one go, and applies them after you confirm.
- **The secretary can change teams and labs by voice.** Move a staff member to another team, move several at once, merge two teams into one, or change a lab's setup. Hard-to-undo steps like merging are shown on a card for you to confirm first.
- **The secretary can read and edit manuals.** It reads a whole manual and explains it, and proposes edits or merging several manuals into one on a card that shows the before and after side by side.
- **The secretary can manage staff.** It checks a staff member's work instructions and shows a suggested revision on a comparison card, looks up scheduled tasks, sets reference documents, and checks and hands out equipment.
- **The secretary can decorate the office for you.** Say "remove all the furniture" and it puts everything away; you can undo that within 10 minutes. Say "arrange it nicely" and it shows a before-and-after floor plan and applies it only after you confirm. Buying furniture and changing floors or walls are still done in the shop, and the secretary links you there.
- **When the secretary can't do something, it tells you why and where to do it.** It gives the reason in one line and a link to the screen where you can do it yourself.

### Improvements
- **You can ask the secretary "why did they stop?"** It checks the employee's last activity, current state, pending approvals and questions, recent tool use and errors, and queued cards, then tells you whether they are stuck or just thinking. It only looks and never changes anything.
- **Questions asked in plain text now reach the approval inbox.** If a staff member ends a message with a question instead of using the question tool, it shows up in the approval inbox so you can answer by choosing. The same question isn't posted twice.
- **When your plan usage nearly runs out, work pauses for a while.** Above 95% usage, scheduled tasks and automatic progress on sub-tasks of a plan pause, and you are notified. They resume automatically once the reset time passes. Tasks you start yourself keep going. From the status board, "Start now" lets you start paused work immediately.
- **Find staff by name on the dashboard and filter by status.** Choose All, Needs attention, Working, or Waiting. Clicking the summary line applies the same filter.
- **Each task card shows its tokens and cost.** Tokens used and cost appear on the card. Cards created earlier have no record.
- **A setup checklist guides you on first launch.** It checks the installation, sign-in, and work folder in order, and offers a button to fix whatever is stuck. You can skip it and do it later.
- **Saves tokens in long conversations.** When a conversation grows long, the staff member continues in a new conversation with the previous report handed over. Short, simple tasks are handled in a lighter way, and this can be turned off per staff member. The payslip shows an estimate of tokens saved.
- **Stronger phone security.** A phone can no longer run PC commands without approval, and the global manual shared by all staff can be created and edited only on the PC. Turning "same network only" back on closes any router port opened earlier.
- **When you reopen the app, cards in progress go back to To Do.** Approved plans continue from the next step. Cards in Review or Done stay as they are.
- **Phones no longer need a new QR code when the PC's address or connection mode changes.** While the phone can still reach the PC, it picks up the new address and mode automatically.

### Bug fixes
- **Fixed the What's New window covering the tutorial.** The window no longer pops up while the tutorial is running.
- **Fixed front-row staff being hidden behind meeting-room chair backs.** Lower chair backs now show seated staff's heads and shoulders.
- **Fixed the app freezing on the tutorial selection screen.** It no longer freezes before the tutorial has started.

## [0.12.2] - 2026-10-26

### New features
- **Approve or reply right from the group chat.** When an approval request or a staff question comes into a group chat, you can approve, reject, or answer it right there. Handled items show their result, such as "Approved", "Rejected", or "Answered".

### Improvements
- **View staff as cards or as a list.** In the staff area of the dashboard you can switch the view, and your choice stays the same the next time you open it.
- **Staff now post questions to the approval inbox.** Instead of a long message, they post a short question there, so you can pick an answer right away.
- **New versions are checked more often.** The app checks every hour, and also right when you come back to the window and when the Mac wakes from sleep.

### Bug fixes
- **Fixed the lead and team members stopping while leaving background work unfinished.**
- **Fixed "What's New" in the sidebar wrapping onto two lines or getting cut off.**

## [0.12.1] - 2026-10-26

### New features
- **Split the office with partitions and walls.** In the shop you can buy two low partitions for dividing desks, a fabric one and a glass one, and two walls for dividing a space, a white wall and a wood wall. Turn them to place them in the direction you want. Staff can't walk through partitions or walls, so they go around them. Staff standing behind a tall wall look faded.
- **Office props move and react.** Props such as the aquarium, coffee machine, printer, and arcade move or light up and off to match the moment. Some props react when staff use them, and some move as people walk past. During events, props such as the Christmas tree and fountain take on a special look.

### Improvements
- **The phone app reconnects faster and more reliably.** When you come back to the app, or switch Wi-Fi or mobile data, it reconnects right away. A brief drop isn't shown on screen right away; "Connection lost" appears only if it still hasn't reconnected.

### Bug fixes
- **Fixed the lead stalling after saying "I'll hand it off" without actually assigning the work.** Now the app notices this and tells the lead again to split the work and assign it. If assigned work is already in progress or a plan is waiting for approval, nothing changes.

## [0.12.0] - 2026-10-26

### New features
- **The app now lets you know when an update is available.** When a new version comes out you get a notice, and you can see what changed right away in the update news.
- **Download a new version right away.** When a new version comes out, "What's new" at the bottom of the left menu shows a "New" mark and a notice pops up. It briefly shows what changed, and "Download" opens your browser to get the installer for this computer. You install it yourself by opening the downloaded file. "Later" stops reminders for that version, and you'll be told again when a newer one comes out. The app checks at startup and every 6 hours, and quietly skips the check when you're offline. You can also see your current version and check right away in Settings under "Check for updates."
- **The phone app also tells you about new versions.** While the app is open it checks when it starts and every 6 hours; when a new version is out, a notice appears at the top of the screen. "Download" opens the APK in your browser, and "Later" hides that version from future notices. You can see your current version and check right away under "Check for updates" in Settings. If the check fails, it passes quietly.
- **Put staff to work with a manual or a Claude command.** Under the staff chat box, '📘 Manuals' shows only that staff member's work manuals and lab/team processes, and '/ Commands' shows only Claude built-in commands (summarize the chat, new chat, code review, etc.) and skills. Type '/' in the box to get one list with 'My manuals' on top and 'Claude commands' below. Move with ↑↓ and pick with Enter. In the group chat, type '@name /' to see the recipient's manuals and commands. Commands the app can't run (login, settings, etc.) aren't sent; you just get a note. Works the same in the phone app.
- **Staff can open a browser to look at websites and work with them.** Turn on "🌐 Browser" in the Equipment tab and that staff member can open a site, read its title, or click buttons and type text. Actions that change a page, such as moving to another page, clicking, or typing, go to the approval box and run only after you approve. Looking-only actions run right away. Each staff member has their own browser, so a login stays saved. If the computer is missing a required program, the switch can't be turned on, and the app tells you what to install.
- **Type / in the chat to pick a command.** A list of skills and commands appears; choose with the arrow keys and press Tab to fill it in. Commands that take nothing extra, like /compact and /clear, are sent right away with Enter (for the rest, Enter just fills them in too). In the group room, use `@name /command`. /compact shortens the conversation, and /clear starts fresh. If you type a command the app can't run (for example /login), it tells you why.

## [0.11.0] - 2026-10-25

### New features
- **The phone app now appears in Korean, English, Japanese, and Chinese too.** At first it follows your phone's language, and if that language isn't supported, it starts in English. Change it under 'Language' at the top of Settings and it applies right away, without restarting the app. Text pulled from your PC, such as employee names and task content, is shown as is.
- **You can use the app in Korean, English, Japanese, and Chinese.** Pick one under 'Language' at the top of Settings and the menus, buttons, guides, notifications, menu bar, shop furniture names, and level names change right away, without restarting the app. At first it follows your computer's language, and if that language isn't supported, it starts in English. Furniture, task cards, and conversation history that are already saved don't change; they are only translated when shown on screen.
- **Cats and dogs roam the office.** The "Office Cat" and "Office Dog" you buy in the shop rest on the cat tower or a cushion, then walk around the office more slowly than the employees and return home. Sometimes they go sit for a moment next to an employee working at their desk. They never get in the way of employees walking. If you put the furniture back in the drawer or sell it, the pet disappears too, and during decorating they stay still at home. When you restart the app, they start at home.
- **You can clear out the office furniture all at once.** 'Clear all' in the decorating drawer puts all the furniture on this floor or in the whole building into the drawer (you can choose to keep employee seats). Nothing is sold or deleted, and right after clearing you can use 'Undo' to put everything back. After clearing, the furniture won't be laid out again even if you restart the app. If you don't keep employee seats, you're only told how many seats are short.
- **The office has been redesigned.** It is now a tile-based office seen from a slanted top-down view, where you can place and rotate furniture to fit the tiles. Employees walk along the tiles and sit in chairs to work.
- **You can see the moment a level goes up.** The newly added tiles light up as they are laid, and at levels where the floor and walls change, light sweeps across to reveal the new floor and walls. The new level, the increased number of tiles, and any new floor appear together above the room. It doesn't show in Work mode or when Reduce motion is on.

- **Each floor now has a different shape.** The 1st floor has an entrance sticking out in front and a terrace on the right. The 2nd floor is L-shaped, the 3rd is a U-shape with a hollow in the middle, the 4th is T-shaped, and the 5th is tower-shaped. Walls or railings appear where parts are cut away, and once a floor area has been created, it never shrinks as levels go up.
- **The meeting room now has tables and chairs.** Depending on your level, it grows through six stages: from a folding round table to a long table, a glass-walled meeting room, a boardroom, and an auditorium. The number of chairs is the capacity, and employees who join a meeting sit in the chairs in order. In the auditorium they sit in the audience rows and listen to the presentation.
- **Rest areas keep growing.** Starting with the lounge corner (Lv.3), new spaces open at each level, such as a pantry, game zone, nap room, library, fitness room, cafe bar, cafeteria, sky lounge, and the CEO's office, each with basic furniture already placed. Each space has a different floor so you can tell them apart at a glance, and you can move the furniture while decorating.
- **It's fine if there aren't enough seats.** Employees who don't have a desk sit in a rest spot like a sofa and work on a laptop. The status board tells you how many seats are short and at which level more will be added, and suggests moving a team to another floor.

### Improvements
- **The outside of the office now sits on the ground.** The office lot no longer floats in the sky but rests on the ground. Beyond the lot, grass and sidewalks continue to the edge of the screen, and the road in front keeps stretching out on both sides past the lot, so people and cars come from far away and pass by. The buildings in the back look like a distant city on the horizon. Where an upper floor sticks out past the floor below, it is built to overhang without pillars. There is no sky; the whole screen is a street seen from above. Roads, alleys, neighboring buildings, and parks continue to the edge of the screen, and at night the ground gets dark while the streetlights and windows light up. Neighboring buildings are muted in color and lower than yours, so your office stands out. Your building has a company flag on the roof, and an orange pin floats above it pointing to your office. When you hover the mouse over it, the building's outline glows. You can click anywhere on the lot, not just the building, to go inside, and clicking a neighboring building does nothing.
- **Employees now use less of your usage allowance.** When a conversation gets long, it moves to a new conversation earlier. The most recent report is carried over as is. Less is sent at a time, so you hit your usage limit less often.
- **Company levels have grown to 20 stages.** With each level up, the office floor widens by one tile, and a floor is added at Lv.6, 10, 14, and 18, up to 5 floors. The floor and wall materials also improve in five stages, and the building's exterior changes from a garage to a ground-floor shop, a brick building, a 3-floor office, a glass headquarters, and a 5-floor tower. Even within the same building, decorations such as signs, awnings, flower beds, fountains, rooftop gardens, and night lighting are added at each level. From Lv.16, an auditorium that holds 20 people appears. Because levels are recalculated under the new rules, your level number may look lower, but your purchased items, funds, and rewards received stay the same, and items you could buy before don't get locked again. Once a level is reached, it doesn't go down even if you let employees go. The first time you open the app after this change, you'll be told about it once.
- **Wallpaper and flooring bought in the shop now cover the new office too.** We redrew 15 wallpapers and 14 floorings for the new office design. If you pick the work area in the shop, the entire office floor and walls change, and if you pick the meeting room, the meeting room floor and the wall behind it change. Press "Reset to default" to go back to that level's floor and walls. The new office has no separate lounge, so a floor you previously laid in the lounge is not shown.
- **Office decorating now works like a drawer.** When you press "Decorate," a drawer opens below the button (at the bottom of the screen on a phone). Tap a card to take out furniture; if the floor tile is green you can place it, and if it's red you're told in one line why not. Rotate with the R key, a right click, or the rotate button, and tap placed furniture to move it or put it back in the drawer. Furniture bought in the shop goes into the drawer, and pressing "Place" in the shop opens office decorating and starts with that furniture in hand.

### Bug fixes
- Fixed an issue where clicking a neighboring building or the grass on the outside screen would take you into the office. Now you only go in by clicking your own building and lot, and when you hover over your building, a hand cursor appears and the outline glows.
- Fixed an issue where the alley on the outside screen abruptly ended at the grass in front of the main road. The alley now continues to the main road to form an intersection, and there is a crosswalk where it crosses the sidewalk.

## [0.10.2] - 2026-10-24

### Improvements
- When a meeting run by the lead ends, a "Meeting results" card is created as a draft plan. It contains separate sections for decisions the CEO made personally, decisions delegated, decisions left unanswered, to-dos with suggested owners, and the meeting minutes. Even if the lead changes the decisions when submitting the plan, they are refilled with what was actually decided in the meeting, so you can check the meeting's decisions as they are on the plan review screen. Starting the card and approving the plan are still done by the CEO, as before.
- When the CEO says "decide it yourself" on a decision in a meeting, the meeting host (the lead) decides right away. Who decided what, and why, is left in the group chat, and from the next remark onward, the meeting follows that decision.
- Decision cards in the meeting room and the approval inbox are distinguished by color and label according to their status. A decision waiting for an answer shows in yellow as "Awaiting reply," a decision the CEO answered personally shows in green as "Decided by you," and a delegated decision shows in orange as "Delegated · decided by." Questions awaiting an answer are shown in full from start to finish, while questions already answered are shortened to two lines and expand when you press "Show more." It looks the same on a phone.

### Bug fixes
- Fixed an issue where the beginning of the question in a meeting decision request was cut off. Also fixed an issue where an employee merely mentioning the words "decision request" was wrongly treated as a decision request and their remark disappeared.
- Even if you press "Start" on a task card twice, the same task goes to the lead only once, and the lead is no longer blocked with "Received multiple tasks" when submitting a plan.
- Even if the lead asks for opinions "again" and submits a revised plan with a changed title, no duplicate card is created; it goes into the original card.
- Fixed an issue where, after restarting the app, a decision from an interrupted meeting was missing from the approval inbox but still counted in the number next to the menu.

## [0.10.1] - 2026-10-24

### Improvements
- **Employees work faster and use far fewer tokens.** Because the same conversation kept going, every time an employee used a tool, the entire conversation so far (sometimes hundreds of thousands of tokens) was sent again. Now, when a conversation gets long, the next instruction starts a new conversation and only the most recent report is carried over. Earlier conversations are not deleted. However, because only the most recent report goes into the new conversation, the employee may not remember the fine details of earlier conversations. "Continue in terminal" also opens that new conversation.
- **The employee panel is wider.** We moved the employee's moving picture to a small box next to the name at the top of the panel, so more of the tasks, changes, equipment, and profile content is visible vertically.
- **The payroll statement now focuses on actual usage.** At the top are your Claude plan usage rates (5-hour and 7-day), and below are the tokens each employee used today, this week, and by month, along with their share. We removed the app's own token limits (daily, weekly, monthly), the monthly budget ($), and per-employee monthly budgets, because the actual limits are set by your Claude plan. Instead, you are notified when plan usage reaches 80% and 100%. The "This month $" in the top bar has also changed to plan usage. The company funds (₩) used in the shop stay the same.
- **You can see employee status at a glance on the dashboard.** The card border and background take on a status color. When working, a green border softly blinks; yellow means confirmation is needed, and red means an error. Cards of employees who have clocked out look faded.
- **The mini view on employee cards feels less cramped.** Even when the card gets wider (on a phone or narrow window where there is one card per row), employees are not enlarged and more of the left and right of the office is shown.
- **The phone app icon now matches the PC app.** It is a pixel-art office employee.
- **The phone app version number now matches the PC exactly.** From now on, if the PC is 0.10.1, the phone app is also 0.10.1, so you can tell whether they match just by looking at the numbers. The number changed from the old 1.1.3, but it updates right over your existing app.

## [0.10.0] - 2026-10-24

### New features
- The **Assistant** has arrived. Call it from "Assistant" at the top left, or anywhere with ⌘K (Ctrl+K on Windows), and ask or instruct it by speaking. It immediately answers how to use the app, the current status, and what was done overnight, while anything that changes something, like "Create a development team and hire a frontend developer," is shown as a confirmation card and only happens after you press [Run]. For work guidelines, task descriptions, and manuals, it shows the original and the polished version side by side, and they change only after you press [Apply]. During auto-approval, the Assistant checks the grounds and answers employees' questions on your behalf, and leaves questions that need a CEO decision until morning. Tokens used by the Assistant are shown separately as "Assistant" in the payroll statement. The same Assistant is available in the phone app.
- Auto-approval: so that employees don't stop while waiting for approval when the CEO is away, the app approves on your behalf. You can choose "From now for 1, 4, 8, or 12 hours" or "Every day 23:00–08:00," and it turns itself off when the period ends. It approves file edits, ordinary commands, and commits on your behalf, while dangerous commands and anything sent outside (pushing, deploying, email, sending messages, etc.) are left in the approval inbox as they are. It carefully screens and leaves even cases that try to get around this, such as slightly altered commands (for example, a push with a path option added) or creating and running a script. Things approved on your behalf are recorded as "🤖 Auto-approval," and when it ends, you get a summary in the group chat and a notification such as "47 auto-approved (40 edits, 7 commands), 2 waiting, 3 questions answered for you." In the meantime, if an employee asks, the Assistant answers on your behalf based on the plan and instructions (questions that need the CEO's decision are left until morning), and what was asked is also left in the summary. Turn it on in the "Auto-approval" section of Settings; while it's on, "🤖 Auto-approving · time left" appears at the top, and pressing it turns it off right away. What was handled on your behalf can be seen under "Auto-handled" below the approval inbox. You can also turn it on and off from your phone.
- A small window in the employee profile and the dashboard employee card shows what that employee is doing in the office right now. It follows them even if they're on another floor or in the lounge, and if they're at a meeting on another floor, it shows that meeting room. It keeps moving even if you've closed the office screen and are looking at another screen. It only draws windows that are visible on screen, and if you minimize or hide the app window (on Mac, even when completely covered by other windows), it pauses the office drawing to use less of your computer. It draws at a slower rate on dashboard cards, on phones, and when running on battery. If you turn on "Reduce motion," it shows a still picture instead, and in Work mode this window is hidden.

### Improvements
- We redesigned the menu bar menu (the icon at the right of the taskbar on Windows). At the top it shows working, needs confirmation, completed today, and cost today, and you can turn auto-approval on and off and see the time left. Employees are grouped by team and lab and all are shown (previously only some were shown). From the menu you can also stop all working employees right away (auto-approval turns off with it), add a to-do from copied text (it goes through a confirmation window), and turn phone connection on and off (it asks once for confirmation when turning on).

### Bug fixes
- Fixed an issue where, when the lead submitted several plans at once, the second plan onward overwrote the first plan card. Now a separate card is created for each plan.
- Fixed an issue where an error sometimes occurred while drawing passersby the first time you opened the outside (street) screen of the office building.

## [0.9.0] - 2026-10-23

### New features
- We opened a path on the PC so that you can handle the entire office from your phone exactly as on the PC screen (hiring employees, changing settings, the task board, meetings, viewing files, uploading attachments, and more). Once you turn on phone connection, you can use it right away (there is no separate switch to turn on). A phone that scanned the QR can handle everything in this PC's office, so don't show the QR to anyone, and if you lose your phone, please create the QR again. Things only possible on the PC, such as choosing a folder or opening a terminal, tell the phone "Please do this on the PC." Instructions and approvals made from the phone are recorded as "📱 Remote." (The phone app also needs a new version.)

### Improvements
- On a PC where you used a connected phone before the update, a "Connected phones can now control everything on the PC" notice appears once at first. If it isn't your phone, you can create the QR again right there.
- We fitted the screens to the phone so you can use the PC screen as is in the phone app. There are bottom tabs (Office, Group chat, Task board, Approval inbox, More), windows that slide up from the bottom, two-finger map zoom, and for folders you can type a path or pick from recent folders. If you hold a tablet sideways, it is the same as the PC screen.
- If you change the phone connection port, that port is saved and used as is even after restarting the app. Before changing it, you're told that "connected phones will be disconnected and need to scan a new QR, and if you opened the port on your router yourself, you also need to change the router settings."
- We reduced cases where the connection dropped when a phone loaded many screens at once.
- We made phone connection security stronger. Requests without a connection key are rejected right away before their content is received, and only the necessary items from what the phone sends are accepted. Even when a file has disappeared or the PC is low on storage, the app doesn't stop and tells the phone.
- We prevented the installed Claude Office and the development Claude Office from opening the same data at the same time and overwriting each other. If one is already running, the second app says "It's already running" and quits.

## [0.8.1] - 2026-10-23

### Bug fixes
- Fixed an issue where the phone couldn't connect to the PC even after scanning the QR on the same Wi-Fi at home or at the office. The QR now also contains an address for the same Wi-Fi, and the phone connects to that address first. Under the QR on the connection guide screen, both the "Same Wi-Fi" and "Outside" addresses are shown. (The phone app also needs to be updated to the new version.)

## [0.8.0] - 2026-10-23

### New features
- **Phone connection (PC side ready)**: If you turn on "Phone connection" in Settings, you can use the phone app even when away to see employee status, approve and answer questions, check plans, and send instructions. The phone app is released separately.
  - **It is off by default.** Only while it's on is one door (port) of this PC opened toward the internet, and it closes right away when you turn it off.
  - Before turning it on, you confirm the precautions, and it guides you in the order of port number → automatic router setup → address (optional) → QR. If your router doesn't accept automatic setup, it tells you the values to set yourself.
  - The phone connects by scanning the QR. The QR contains this office's key, so don't keep it as a photo. After 5 minutes, it is hidden on screen.
  - If you lose your phone, press "Recreate QR." The old key is blocked right away and all connected phones are disconnected.
  - The phone checks by itself whether this is the right PC, so it won't connect to a fake PC. All connections are encrypted.
  - If someone tries to connect with a wrong key several times, it locks briefly and tells the PC. You can also view the recent access log.
  - What you can do from the phone is only viewing status, approving, answering questions, checking plans, and giving instructions. You can't view files, hire, or change settings.
  - Approvals and instructions made from the phone have the same power as those done directly on the PC. If you lose your phone, press "Recreate QR" right away.
  - Approvals and instructions made from the phone are recorded as "📱 Remote."
  - The phone checks about every 15 minutes, so notifications can be delayed by several tens of minutes.
  - If an approval's content is too long and only part of it shows on the phone, you can only reject it from the phone, and you approve it on the PC.
  - The phone only shows the name of the tool the employee is currently using. The command being run and file locations are not sent.
  - Only the place that tried to connect several times with a wrong key is briefly blocked. If attempts pile up from many places, the PC is notified.
  - If you turn phone connection off and on, a new QR is ready right away when no phone is connected yet.
  - If this PC's connection key can't be read, a new one is created and you're told to reconnect with the new QR.

### Improvements
- If you stop a working employee with Esc or the stop button and talk to them, they pick up the task they were doing on their own after the conversation ends. If it was a subtask of a plan, the paused plan also resumes, so you don't need to press "Resume" separately on the task board. If you want to stop completely, press stop on the task board.
- When an employee posts a follow-up task card while working, they can assign an owner. If an owner is written, that employee starts right away (after their current task if busy), and if there's no owner, it goes to the lead. This ends cases where unassigned cards piled up on the board and nobody did them.

## [0.7.3] - 2026-10-22

### Improvements
- The meeting room grows with the company level. The maximum number of attendees increases from 8 at Lv.1-3 → 10 at Lv.4-5 → 12 at Lv.6-7 → 14 at Lv.8-9 → 16 at Lv.10, and the table gets longer and better from folding → solid wood → oak → walnut → boardroom (with chairs, whiteboard, and screen also improving). The meeting room's name tag shows the maximum capacity, and when the seats are full, it tells you at which level the meeting room grows. With more than 10 attendees, it warns "Many attendees, so it will take a while."

## [0.7.2] - 2026-10-22

### Improvements
- If you press Esc in the input box while an employee is working, they stop what they're doing (the text you were writing stays). When sending a message, if you choose "Stop right away and listen first," they stop what they're doing, listen to that message first, and then continue the task card they were working on.
- When a meeting ends, instead of making many separate to-do cards, one "Meeting results" card is made for the lead who led the meeting. The lead sorts the order of the work and submits it as a plan, so implementation never starts before the plan or draft is out (for meetings without a lead, separate cards are made as before).

## [0.7.1] - 2026-10-21

### New features
- **Continue in terminal**: If you press "Continue in terminal" at the top of the employee panel, your conversation with that employee opens as is and continues in Claude Code in the terminal. It can only be opened while the employee is resting, and what you continued in the terminal is carried over the next time you give instructions in the office.

### Improvements
- In the employee instruction and group chat input boxes, ⌘+Enter (Ctrl+Enter on Windows) starts a new line. Enter still sends, and Shift+Enter is also a line break.
- We changed the employee panel input box to look like the Claude app. The attach (📎) and send (↑) buttons are inside the input box, and when an employee is working and the input box is empty, the send spot becomes stop (⏹). When you write something, it becomes send again so you can send an additional instruction. The input box grows as the text gets longer.
- With "A− / A+" above the task log in the employee panel, you can change the text size (12-18px). It applies to both the task log and the instruction input box, and your chosen size is remembered.

## [0.7.0] - 2026-10-21

### New features
- **Works on Windows too (beta)**: On a Windows PC, you can unzip the archive and run it right away. Office features such as hiring employees, assigning work, approvals, reports, group chat, meetings, and payroll statements work exactly as on Mac.
  - The first time you run it, press the login button to open a command window, and log in by following the instructions.
  - Even if you close the window, an icon remains in the notification area at the right of the taskbar so you can approve right away.
  - Connecting to Claude Code opened outside the office and screen capture still only work on Mac. The related settings show "Windows coming soon."

## [0.6.0] - 2026-10-21

### New features
- **Office building exterior**: When you enter the office screen, you first see the company building. Click the building to go inside, and press "Outside" to come back out in front of the building.
  - As the company grows, the building also changes from a garage → small office → 2-floor building → campus. Even within the same stage, signs, windows, and flower beds gradually get better.
  - Hover the mouse over "Preview next expansion" to see the next level's building.
  - At night, the windows light up.
- **Multi-floor office**: A 2nd floor appears from company level 8, and a 3rd floor at level 10.
  - You can view other floors with the floor buttons on the right or the floor map at the top left. The floor map shows each floor's teams, headcount, and whether a meeting is going on.
  - You can choose which floor a team works on from the team card in the org chart (the 1st floor at first).
  - Each floor has a meeting room. A meeting is held on the floor with the most attendees, and at the seats of attendees on other floors, "In a meeting on floor N" appears.

### Improvements
- We redrew the outside of the office building. A street spreads out in front of the sky and city scenery, people walk on the sidewalk (and sometimes go into the office), and cars pass on the road. At night, the windows, streetlights, and car headlights light up. When you hover over the building, the entrance light turns on and an "Enter" prompt appears.
- When a plan taken on by the lead is finished, its subtask cards automatically move to "Done." Only one plan card remains in the review column, so you just look at the result and press "Review complete."
  - If you fix a plan and approve it again, the subtask cards made earlier are tidied as "Superseded."
  - If the lead bundles to-dos from a meeting into a plan, those cards disappear from the to-do column, show up inside the plan card, and are completed together when the plan ends.
- The task board and reports don't break even when you make the window narrow. The task board keeps its column widths and can be scrolled sideways, and in reports the daily report continues below the timeline.

### Bug fixes
- The office map freezing after changing floors
- An employee showing as "Idle" while working, and an empty report arriving before the assigned work was even finished

## [0.5.1] - 2026-10-21

### New features
- **Registering reference documents**: If you register "documents to read first" in an employee, team, or lab setting, the employee reads those documents before starting work and works that way.
  - Add them by choosing a file or pasting its location, and remove them one at a time. Up to 5 per setting.
  - For a lab, you can add the guide documents in the project folder all at once with "Add recommended."
  - If the same document is registered in several places, it is passed along only once. A deleted document is reported as "File missing."
  - Approval is not asked when reading registered documents.

## [0.5.0] - 2026-10-21

### New features
- **Dashboard status board**: At the very top, see at a glance how many people are working now, tasks needing confirmation, errors, and people resting. Click a number to show only those employees.
  - Items needing confirmation (approvals, questions, errors, budget overruns) are gathered in one place, and approvals can be approved or rejected right there.
  - Usage and budget bars and recent activity are shown together. Each employee card shows the time worked like "12 min" and the assigned task.
- **Work mode** (top of Settings): Turn it on when leaving the app up on a company screen. It hides game elements such as the office map, company funds, the shop, and levels, and shows only the work screens. While it's on, the app starts on the dashboard.
- **Customizing employee appearance**: Pick hairstyle, hair color, skin, clothes, and accessories (glasses, hats, etc.) one by one. There is also a random pick, and when hiring, an appearance suited to the job is applied. Existing employees' appearances stay the same.

### Improvements
- In group chat, use `@teamname`, `@labname`, and `@everyone` to assign work to several people at once. People who overlap receive it only once.
- If you send in group chat without mentioning anyone, one employee suited to the work takes it and tells you who took it. Before sending, the recipient is previewed below the input box.
- You can change an employee's name, job, and AI model in the "Profile" tab. It applies from the next time you assign work.
- Typing no longer slows down even when conversations and task logs get long.
- You can adjust the width of the employee detail window by dragging its edge. Double-click to return to the original width, and your changed width is remembered.
- There are more permission choices you can give employees.
  - "Command autonomy": Run computer commands without approval.
  - "Read-command autonomy": Commands that only look at files run without approval, while commands that change things need approval.
  - "Block dangerous commands": Commands that are hard to undo, like deleting files wholesale, are always blocked.
- We added a "Instructions and reports only" view to the task log. When on, it hides the intermediate steps and shows only what you assigned and the employee's reports. Even when you scroll, the title and this switch stay pinned at the top.

## [0.4.0] - 2026-10-21

### New features
- **Labs (project teams)**: Pick people from several teams to form a project team. Set the lead, goal, and project folder, and one person can join several labs. You can also start a lab meeting right away.
- **Giving big tasks to a team lead**: When you give work to a team lead or lab lead, the lead makes a plan, splits the work, assigns owners, and submits it to the approval inbox as "Plan review." Once you approve, the work goes one by one in order, and when everything is done, the lead summarizes and reports.
- **Work manuals**: Create the order of work as a manual and teach it to employees, teams, and labs. You can make the order for work done alone, or a flow where several people take over in turn (planning → design → development → review → testing).
- **Answering employee questions**: When an employee asks a question with choices, pick and answer in the approval inbox or the employee window. If you turn it on in Settings, you can also answer questions from Claude Code used outside the app here.
- **Company growth**: The more employees work, the higher the company level goes, and the office grows in 10 stages from a garage to a campus. A celebration screen appears when you level up.
- **Company funds and shop**: Funds build up as employees work and finish tasks. In the shop, buy and decorate the office with 101 kinds of furniture, props, wallpaper, flooring, desks, and chairs.
  - When you place furniture, resting employees go and use it (coffee machine, piano, cat, etc.).
  - There are a collection book, set bonuses, daily changing missions, achievements, today's special deals, and seasonal limited items.
- **Checking what employees did**: See what an employee changed in the employee window's "Changes" tab, and when you approve, you can leave a save record and even share it with the team.
- **Equipment**: Set the tools, manuals, permissions, and monthly budget each employee can use.
- **Menu bar icon**: Even if you close the window, the number of things to check shows in the menu bar at the top of the screen, and you can approve or reject right from there.
- **Office decorating**: Drag to place props, desks get better with employee level, and employees clock out when work hours end.
- **Managing Claude Code used outside the app**: You can formally hire it into the office and keep assigning work, hand work to a "clone" that copies the conversation, or shut it down.
- **First-run guide**: It guides you through an app introduction, a check of Claude Code readiness, and a tour of each menu.
- **Meeting improvements**: If a decision is needed during a meeting, it pauses and asks. Owners are pre-filled for the to-dos in the minutes, and "Start all" hands them off at once. You can pick attendees by team or lab all at once (up to 8 people).
- **File attachments**: You can attach files and screenshots to instructions, group chat, and task cards. Employees can also report with images.
- **Usage limits**: In the payroll statement, set how much to use per day, week, and month, and you're notified at 80% and 100%. Your Claude plan's usage rates (5-hour and 7-day) are also shown for reference.
- **What's New**: See what has newly changed in the app, and you're told the first time you open it after an update.

### Improvements
- You don't have to set an employee's working folder. If you don't, they work in the project you mention when assigning work.
- Reports and meeting minutes written by employees now display nicely, including bold text, lists, and tables.
- Click a task card to see the full description, attachments, and reports.
- When work piles up on one employee, it is handled one at a time in order.
- When you restart the app, unfinished work continues.
- If you change settings while an employee is working, it applies after they finish what they're doing.
- You can zoom in, zoom out, and move the office map. Only employees you allow can take screen captures without approval.

### Bug fixes
- Characters looking buried in or floating above sofas and chairs
- The whole screen being pushed when the employee window had many approvals and questions
- Long reports being saved cut off in the middle (cut-off reports restored to the original)
- When a team lead submitted plans for several tasks, they attached only to the first task
- Pressing approve doing nothing when settings were changed while waiting for approval
- Task cards, long text, input boxes, and status displays overflowing or misaligning outside their boxes
- Manual descriptions looking broken or appearing twice
- An error that occurred when turning decorating on and off after visiting the office screen

## [0.3.0] - 2026-10-20 — First installer

### New features
- An installer you can install on a Mac (Apple silicon)
- App icon: a picture of an employee raising a hand at their desk
- Resting employees move in more varied ways: looking at their phone, sleeping with their head down, drinking coffee in the pantry, resting on the sofa, visiting a coworker's desk, and more
- Employees walk naturally along the aisles and hallways
- More office props: signs, windows, posters, clocks, copiers, and a different plant, books, etc. at each desk

### Bug fixes
- The "can't be opened because it is damaged" message appearing when opening the downloaded app

## [0.2.1] - 2026-10-20

### Improvements
- Characters change to front, back, and side views depending on the direction they walk, and face each other when talking
- Chairs look more realistic (an empty chair when the seat is vacated)
- The office drawing and text are sharper on high-resolution screens
- Movement is more natural: walking, blinking, breathing, waving a hand to ask for confirmation, dozing off, and more

## [0.2.0] - 2026-10-20

### New features
- We redrew the office in a bright, clean style
- Resting employees go to the lounge, and employees in a meeting go to the meeting room. Hover the mouse over an employee to see their info
- **Teams and team leads**: Create a team in the org chart and choose a team lead, and the lead divides work among team members
- **Task board**: Manage work as to do → in progress → review → done
- **Approval inbox**: Handle all employees' permission requests in one place
- **Group chat**: Employee reports arrive as chat, and you assign work with `@name`
- **Meeting room**: Several employees take turns giving opinions, and minutes and to-dos are created
- **Scheduled tasks**: Assign work at set times (morning briefing, end-of-day report, etc.)
- **Reports and payroll statements**: See what was done during the day, and each employee's usage and cost
- **Profiles, levels, and office decorating** (themes, day and night, plants)
- Choose a screen from the left menu to move around

## [0.1.0] - 2026-10-20

### New features
- First version: a desktop app that treats Claude Code as "employees" and puts them to work
- **Dashboard**: See each employee's status as a card, and click to check approvals, instructions, stopping, and what they did today. If confirmation is needed, you get a computer notification
- **Hiring and dismissing employees**: Hire by setting appearance, name, job, AI model, approval style, and work guidelines
- **Office map**: Employees work, raise a hand, or doze off depending on their status
- Claude Code used outside the app is also shown as an "external employee" (turn it on in Settings for real-time notifications)

## [0.0.0] - 2026-10-20

### New features
- Project start: decided what to build and created the basic documents
