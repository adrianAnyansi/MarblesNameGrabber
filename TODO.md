# TODO.md

# Old optimization summary
## Rust 
Testing Rust with a simple "extract white pixels" gave a x8-x10 speedup in Rust, however this is JUST for binarization. Since the OCR takes about 3/4th of the time, I don't think rewriting the parser to get about 350ms of time actually helps. 
Similarily, OCR might become super fast, or it might be 10% time save.
The project is a time-sink and I want to focus my time on per-name efficiency over accuracy so I'm focusing on that instead.

## Timing
The current time frame is 
-  22ms to build the buffer in memory
- 214ms to binarize the image from all sections
- 591ms for local tesseract
- Or 1.520s for lambda, which sucks but I have no clue why its so slow.

Lets take the worst case scenario and say full timeline of a page recogn takes 2.2s
The number of lambdas I use is a queuing problem since FPS will never be less than binarization time, meaning that the amount will increase, I have to keep track of expected queries and etc.

Currently I have a max of 32 lambdas for testing, but I'm just going to increase it during testing and etc.


# Focus today

Get the username bounding boxes, and their lengths, and time this information.

Username color (193, 192, 195), 1694-5

# Goals

This is gonna be achieved in a few ways.
1. Ensure I know when a username is on screen, and it's lifetime (about 3.5s)
2. Know when names are blocked by alerts/chat/barb/etc by checking for issues.
3. Enable burst processing whenever I need precision
4. Use temporal processing AND (chat image detection) to improve username recogn

## Username tracking
With the new UI, every username has a white rounded-box around it.
I can quickly determine each name existence without OCR by checking this value.

Plan right now is to quickly find each bounding box to monitor username tracking.
With this, I can check
1. When username appears on screen
2. When username begins to leave screen
3. *If missing, an overlap can be determined

## Overlap figuring
There are 3 things I need to pay attention to- or rather think of Goal 1 as "verifying username" and this as "verifying hidden username".

Plan is to focus Goal 1 over 2 since 2 is more broad, but understand that verifying Goal 2 is what makes the accuracy/transparency of usernames better and triggers burst processing.

1. Determine the number of users in the lobby from top-left. If unable to read this, call top-overlap.
2. Determine if the Everyone UI in top-left can be read.
3. Determine if the UI for top-right can be read consistently.
4. Determine if all usernames can be found*
5. Find where Barb is

I have a bunch of techinques for finding each Stream Overlay but I think its makes sense to work backwards
- Can I read every username -> Assume screen is clear
instead of 
- Where is everything on screen -> Ok I can't read "this" area because I can't really determine how much of the screen is covered

## Burst processing
This is a little contenious right now.
If I can improve the chat overlay, I can tell read those names and burst processing isnt necessary.
But if alerts AND barb block names, then this is the only way to get as many as possible.

Essentially through tracking I'll send images of the names when changes are expected to occur
(tracking name length is great for this) and have an extremely accurate username list.
Since SOME part of the screen will be clear, I can enable burst processing whenever username changes and I know I need to get part of the scrren cleanly.


# Disaster Recovery PLAN
What is needed to get marbles site running?
[x] Fixing the names box
[x] Fixing the colors (if those have changed)
[x] Fixing start recognition
[-] Native Tesseract in Lambda (not efficient?)
[x] Website update + notes
[ ] Admin stuff + page


# Notes

## Website
Verify image logic isn't going to happen, also with the new tech it's going to be fairly accurate in the fact it can handle aliases.
I just wish I had better text recogn to check when letters are covered by something

The other thing is judging by how people use it, I doubt anyone will crowd source the capctha. 

---

# Server setup notes
I installed a bunch of other things- but didn't save the other commands.
I added PM2, nginx and a few other things. Should probably save the bash history
---
    sudo apt update
    sudo apt install streamlink
    sudo apt install ffmpeg (already installed)
    mkdir github
    git clone https://github.com/adrianAnyansi/MarblesNameGrabber.git
    cd MarblesNameGrabber/
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
    source ~/.bashrc
    nvm install v18.17.1
