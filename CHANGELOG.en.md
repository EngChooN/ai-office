# What's New

The app's "What's New" screen shows this file as is. It is written **so that someone with no development background can read it and understand right away**.

Writing rules
- For each version, write under `## [version] - date`, divided into `### New features` / `### Improvements` / `### Bug fixes`.
- Write from the user's point of view, describing "what you can now do." Do not use technical names (file paths, program or library names, English abbreviations). If one is truly needed, put it once in parentheses after a plain-language explanation.
- Development details (how it was built, where files are) go in `SPEC.md` and `docs/changelog-dev.md`.

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
