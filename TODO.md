# TODO.md
I've gone through the individual steps required to make this work way too many times, I'm gonna stop trying to put it together in my mind with all the fuzz/fluff = fluzz

Plan is validating individual steps then putting them together with heavy testing.
Don't think about the obstacle detection validation right now.

# Goal - Track Every Username
---
The goal is every single name should be tracked even if I can't read it or get a good option.
- Internal count should match on-screen count.
- Should have an image with every name
- Increase OCR percentage
    - If OCR doesn't match the on-screen, this should fall back
- Better admin page
- Better fail-back when people enter their names to the UI

## How to achieve this
- Faster FPS to catch names especially when only a few names are available
- ~~Burst processing when necessary~~ (turns out I have enough time to ignore this and can't change current FPS)
- New Username class with more details and properties
    - length tracking
    - multiple images (temporal processing)
    - better position/indexing
- Custom OCR???


# Focus today
---
Jpeg & png work.
I want to do a perf test on prod (I can lower the FPS but will node handle the stress?)
I also need to think about OCR for that test; perhaps I should just do that next

Did the process lag, now want to do processing & OCR lag
Then move OCR so I can disable it on prod


- Move OCR to a class so its reusable (especially for lambda)
- Upgrade debug/test routes for better testing 
- More clean-up and polish for release



## Think about
- When to do temporal, and is this accurate?
- Stopping mechanism without OCR? Oh I can just match the 1000/1000 check
    - Just use old check, time-based after first name read
- See if there's a pattern for name timing
- How to detect and solve for image compression issues
- How to detect lag from LIVE (particularly with AWS)
    - thinking the number of frames per second imo
- Move OCR out of the server, so I can have a generic class and not 15 million functions

## Bugs
---
- PNG still has a bug, debug this (header not found, was off by 2)

- Still inaccuracies with offset (negative), usually because there's not enough testing name lengths to test with
- Really long names offset the !play and don't get read by OCR or length
- Some lengths are not detectable because the smear for the line is too much
- sometimes the blue background can override the name and cause a blank read
    - need to look at the black pixels to determine colour imo



# Long thoughts
---
## Overall

There are a couple things to focus on that branch out
I want to write them so I can prioritize and stop getting distracted

- OCR
    - Compart OCR and push into class
    - Add queuing to native OCR
    - Deprecated Node native worker?
- Custom OCR
    - Write demo OCR and time against current
- Binarization
    - Reduce time for binarization to complete, ~9-20ms (actually goes down with caching)
    - Fix bug with blue BG overriding colorSpace?
    - Clean-up old code
- Unit-testing
    - Add a unittest framework for a bit of speed and sanity
- Server
    - Clean-up server routes
    - Deprecate debug/test
    - Figure out some framework to start server, send test url, and test names
    - Clean-up internal variables
- Name-run
    - Work on overlap detection and handling
    - Work on end of read state detection
- Frame
    - Work on length matching

## Deprecating prediction
Lets talk about the prediction logic.
Why did I want the prediction in the first place? What purpose was it made for? Two reasons.
1. The intention was that I wasn't going to check the length every frame, because checking appearance & length takes 12ms and I had 16.6ms of budget. However that's a worse case scenario AND thats 24 length checks when ideally, I only maybe have 1-2 new checks to add per frame. And I now have 30ms of time.
So its better to verify the position instead of guessing/predicting.

2. The only time I can't verify the position is if there's a completely hidden screen. Not only this a super super edge case, the only purpose is to track exactly how many names were missed.
But this can be determined by looking at the final score. There's no advantage to tracking this once it's discontinous other than clout.

The reason I'm debating this is cause I've determined that around 3 names spawn off-screen, and I don't have any way except numbers to know that they're there, and god thats stupid.
So I'm avoiding it, cause it really doesn't matter if I have a discontinous match as long as it doesn't keep happening.
Looks like its 3 names off-screen, but with only the total number to anticipate, its a major pain.
I can revisit later but I'll rather move on from this project.

## OCR
OCR needs extra improvement and testing-
Need a better state mechanicism 
Also run testing with the new binarization to check for accuracy

### Handgrown OCR
Making one of these would be significantly faster, and also much more accurate than normal.
This however is a blackhole that I'm avoiding if possible.
But if I were to do it, I'll
1. Make a program that can split glyphs apart vertically
2. Pull each glpyh into an image and save on file
3. Use some dumb algorithm to build a program for detecting these images quickly
4. Actually time and use it in the server

Will put more details if I ever get to doing this (it would be useful) but just no right now.

## Tested in prod
Finally tested in live- yup server is too slow.
Good news, my ffmpeg query was trash, testing that now.

JPEG is much faster than PNG so need to swap
JPEG-LS slower slightly 
JPEG-2000 way too slow
BMP slow and eats memory like a horse
PNG also slow, so JPEG high quality it is-

# Server 

Refactoring this to be a little less huge
Server should focus on only a few things

1. The state of processing, and managing the classes to do so
2. Managing the state / frame for what and when to process
3. Getting the data to the front-end when requested
4. Managing twitch monitoring 

So I need to move OCR out of this to be cleaner

# ScreenState summary
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

## Verify step
Ok first let me buff the line detection, 43.png is very clean
(fixed this but line detect needs more tweaking so clean is 100% and jittery* is 60% but tolerance)

## Merge step
UNTracker holds a prediction of the current frame
Server (server state/etc) holds the current frame
This needs to reconcile and then be updated in the UNTracker, lets discuss

- Server needs prediction for ? nothing really
- Prediction needs the total count for a good prediction, but not required* for past data
- Server wants to know if users are verified and also keep references so it can directly update objects
    - also lets me work iteratively, synchronous length & queueing OCR & (forogt)
- Server wants to know predict offset or unknown exitTime check to tell when to do a list shift check.
    - Once list shift is confirmed, the internal prediction offset should be updated
    - Server needs to be able to say (this UN exists, but unknown enterTime for special cases)
    - Its ok to have too many usernames created and cull later, as long as i verify when they're on screen... Say worst case a full black screen occurs, I could just estimate missed UNs and if it magically continues, just continue generating.

- Once list is synced, I should have a merged predicted + verified list. Then Server can start the *new info step where it gets new data for this list while knowing the list is saving and verified.

NOTE: For testing, using a special case where the 1st screen is considered previously unknown

This means as long the predict contains the amount of users I want, I can just overwrite things

## New info steps



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


# Disaster Recovery PLAN
What is needed to get marbles site running?
[x] Fixing the names box
[x] Fixing the colors (if those have changed)
[x] Fixing start recognition
[-] Native Tesseract in Lambda (not efficient?)
[x] Website update + notes
[ ] Admin stuff + page


## Website Verify
Verify image can't happen when tesseract "confidence" is so wack.
Wait for more info and testing for this


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
