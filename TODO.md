# TODO.md
I've gone through the individual steps required to make this work way too many times, I'm gonna stop trying to put it together in my mind with all the fuzz/fluff = fluzz

Plan is validating individual steps then putting them together with heavy testing.
Don't think about the obstacle detection validation right now.

# Focus today
Validate the length checking and timing of usernames.
If I need a separate state/checker for (usernames disppearing, figure that out when it happens)

Once this is done and I have all the usernames tracked, then check on obstacle detection and etc.

I'll also go back and clean-up notes, its very cluttered

# Goal - Track Every Username
The Goals is to track every username, when it appears, disappears, OCR and obstacles.
I want to provide a 960/1000 names verified in my final build.
This requires a heavy rewrite and multiple new ways to approach the issue.
- Faster FPS with quicker parsing
- New Username class with better tracking of position
- New server states for custom parsing per frame @ 60FPS
    - Burst processing when visible names is very small
    - Temporal processing if partially obscured
- Custom OCR for even faster parsing for single lines*

# Server Summary
I'm gonna summarize this as I've written this too many times

Server needs to do the following
1. Verify if a frame contains new usernames
2. Verify if obstacles are blocking names and account for this
3. send and retrieve OCR data on less than per page for less lag
4. Do temporal checks for uncertain names*

Now evaluating the actual logic behind all the states for this is REALLY hard.
Therefore while I'll keep my notes on that, Im going to let testing actually evaluate this how I'll detect and manage that.
NOTE: I've decided against making a middle-man class for tracking the marblesName state. I'm keeping this relatively stateless, with maybe a *screenState class & serverState class to clean up some states I've not declared previously. screenState will track obstacles over frameTime.

## Possible Steps
Lets discuss the new internal structure of the server.
1. First, startup as normal
2. wait for the pre-marble-race-screen, but try and detect chat/alert/barb
3. once pre-race exists, find the number of users and keep track of changes to know when names start
4. keep track of username length to track names, OCR unique names or names with low confidence
5. once complete, we're done!

This means that during READING, there are now multiple states that I need to consider
1. Chat covering usernames
2. Alert covering usernames (not necessary, covered by username detection)
3. Barb covering usernames (haven't programmed this)

2/3 can be done by username detection since I cant detect the actual object.
its best to assume any username thats unreadable is covered. 
And I can determine this by knowing the amount of usernames on screen.


# Username Tracker V2
Ha I'll leave the venting but lets summarise here.
Username = UN

1. Keep track per UN timing so to know when username enters/exits screen
2. Only send OCR when username is unclear
3. Return relevant stateless information to Server
    - also recieve updates based on Server detection

The new white outline helps a lot but this is just for the class.

## TrackingUsername + class
New class for usernames. Focus is
- Enter / Exit times
- Keep only 1 image with high confidence

## Username tracking (me Venting about server state)
God I'm tired fuck
Why can't this be easy

Ok so here's the deal, userbox detection is too slow to work every frame. So I've got to do something else.
Good news is that I can still do this iteratively and build everything around this.

Steps
    - Server asks for a prediction, so it can check which names to look for.
    - With prediction, Bin checks for appearance to verify unknown users.
        - Server knows which users are obscured, and should ignore them if necessary
    - If the first predicted user has an endTime (and timing is accurate), no length checks required.
        - Without this, track length of 3 visible names to shift prediction
    - Server will then get length information for users without this info


1. New class, tracks the time when name was first on screen, if known.
    Otherwise, give estimated time. Once the names at the top of the screen have an unknown time, check every frame.

    I don't actually need per-frame tech, I can just wait since the only time this matters is when I go from nothing to full 24 names
Actually wait
I'm dumb
I can detect right line for when something appears on screen even if I don't do length checks

2. When the frame is unknown, track appearance on screen as well as obstructions
    Then track appearance for each name (from empty/unknown)
    Then track length
    Then with a good page, binarize uncertain names and then send for info

So again user-count is just to tell me how many names should be on screen


# Screen State
Keep track of the screen to make config changes to tracking
Details will be determined by testing

## Overlap/UI checking
There's positive detection & negative detection, depending on the info required
[-] Is the user total blocked? (only required for first couple users + overlap)
[-] Is top-left UI blocked?
[-] Is top-right UI blocked?
[+] Is chat on screen and where?
[+] Are alerts on screen and where?
[+] Is Barb on screen and where?
[+] How much of visible usernames are shown?

What/when these checks are made depends on what data is required, certain username states, etc.
Currently some thoughts
- Only check user total during initial load to ~24, since an overlap on UN at screen-top can be detected by discrepancy of visible user count vs. detected usernames
- As always, visible UN in the middle of the screen implies UNs above them
- Barb detection might be odd as non-rectangular shapes can mess up UN box detection
- Chat detection might wait until the chat refreshes to get clean image

NOTE: that burst processing is triggered when there's a low number of UNs visible, but assuming no overlap change only names blocked by highest overlap matter.

NOTE: Uncertain how often to check for overlay changes as alerts are hard to track. Might be triggered by non-visible UNs.

## Burst processing
This is a little contenious right now.
If I can improve the chat overlay, I can tell read those names and burst processing isnt necessary.
But if alerts AND barb block names, then this is the only way to get as many as possible.

Essentially through tracking I'll send images of the names when changes are expected to occur
(tracking name length is great for this) and have an extremely accurate username list.
Since SOME part of the screen will be clear, I can enable burst processing whenever username changes and I know I need to get part of the scrren cleanly.


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
