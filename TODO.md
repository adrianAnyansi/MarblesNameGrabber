# TODO.md
I've gone through the individual steps required to make this work way too many times, I'm gonna stop trying to put it together in my mind with all the fuzz/fluff = fluzz

Plan is validating individual steps then putting them together with heavy testing.
Don't think about the obstacle detection validation right now.

# Long thoughts

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
Will think about OCR and everything once tracking is close to 100%
Nice thing about that is now this is decoupled for tracking, it can be totally async
and the image can separated and doesn't tracking doesn't hang on it

After base tracking, then I'll add overlap tracking states
Then building the number OCR and testing


# Focus today
Ok the only way to know if this is working is having the OCR working.
There are 2 concerns with the OCR right now, but first I gotta fix the length checking

- Also appear does not verify that the name is readable, so I need to check length as well?
    Not clear what the best process is on this since the major obstacle is chat, barb or alert.

Ok feedback
need visible state, would be great if this collapses when it doesn't change, however I want the frame num
So probably turn off when offset = 0 and remove that

I don't think the overlap check is even necessary now, since appear can be run every frame.
Ignoring both appear & overlap checks, my next goal is chat removal.
Actually chat removal isnt necessary as long as the appear runs per frame and catches a blank spot.

There's the case where an alert blocks when chat disappears, but this only matters if the alert is there before the first screen so again, idk.

Its bedtime so going to do some quick testing on that idea then sleep.

---
During testing there was a bug where prediction went backwards, do not know the cause of this rn.


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
