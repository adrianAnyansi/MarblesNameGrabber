# TODO.md

# ONLINE SERVICE PLAN

## Objectives
The goal is a resilent, fast and testable accurate service for this job.
1. Pixel manipulation in Rust (lambda)
3. Improve name recognition by detecting behind the chat box
2. Separate stream download/cutting so the main server can handle requests and crashes without comprimising the name grabbing process
4. Improve name recognition by temporal adding of images and better name indexing
5. Add Website features like better response time, time to recognize, etc

## Thoughts (on Rust)
So the numbers are in. Rust is x10 times faster with a simple rotation matrix & cube collision. 
On my desktop this runs in Node at ~36ms, but I can put a lot more calculation into the background extraction, blah blah blah.

Again the main goal for Rust
1. Improve performance & therefore no. of frames calculated
2. Learn Rust in preparation for the League Minimap project

However this is part of a bigger project to completely production ready this project since its much harder than I initially expected.


However the current focus is getting things running, I anticipate this to take:
3 weeks for Rust rewrite & testing (I'm familiar with the algorithm now, it's mostly getting Rust down and testing improvements + classes)
1 week for S3 change
1 week for Tesseract/streamlink separation (and building a Python/etc server)
2 weeks for name/website improvements
Assuming I work on this everyday.

However first comes PixelHunter testing & using the same current algorithm for (whatever the time to mitigate? is), then I can start on this huge project- or maybe put it on hold while I get back to Project Hoard.


## Goals
1. Rewrite the parser in Rust for performance & accuracy
    1.a Read the !play position to check for existance
        (use a secondary check for overlap, chat box )
    1.b Check for the line at the end for bounds (maybe look at the tops if no overlap)
    1.c Do improved colour match for the whole region
    1.d By matching the playercount, its possible to identify when names start
    1.e Create testing so accuracy can be done automatically
2. Test if native tesseract (Windows/Linux?) is faster performance wise (naive shows 321ms vs 1273ms)
3. Move recognition into S3, zip file not possible
4. Separate the streamlink ingestor to prevent crashing when the server has issues
5. Allow a temporal check now that S3 images contain previous images for overlap testing
6. With higher framerate & performance, checking when names appear/disappear is possible
7. Improve server feedback performance to the user
    7.a Improve the logic for user pinging
        (I can get the name search slightly faster by searching from name, doesnt matter much though)
    7.b Admin page (also I can use S3 for images instead of my server)


# Disaster Recovery PLAN

What is needed to get marbles site running?
[x] Fixing the names box
[x] Fixing the colors (if those have changed)
[x] Fixing start recognition
[ ] Native Tesseract in Lambda

Native tesseract (also v5?)
592.755499958992ms
590.9905000329018ms
579.6887000203133ms

WASM
1594.7734000086784ms
1630.4746000170708ms
1634.950100004673ms

nearly x3 speedup
## todo TODAY
Look at alias list (its not working at all)
Debug userList (indexing problems)

## todo later
Server
    Reduce memory stuff (memory)
        Think about reducing the images used based on confidence 
        Or only save unique names to prevent pile-up of data

    START/STOP AUTH
    Verify image backend 
        request_id + info (in set)
        if 1, add to verified (only if username is not taken)
        once info has 2 similar results, add to verified



# Notes
## Computer text recogn
No longer considering doing a individual letter recogn program...
Not only is this very long and tiring; apparently OCRs are designed on computer fonts which was my main concern.

I just can't give so much time to re-inventing something like this for a miniscule time improvement; it would need to be a least x4 improvement and even then, thats just to get more frames in the muncher. The time lost makes a menial change to the overall accuracy (but need to test that first)

## Website
Verify image logic isn't going to happen, also with the new tech it's going to be fairly accurate in the fact it can handle aliases.
I just wish I had better text recogn to check when letters are covered by something

The other thing is judging by how people use it, I doubt anyone will crowd source the capctha. 


## Bugs


# Long thoughts

## General Server Notes
Here I'm putting general improvements for the server & other notes.

- Show marbles ingest date?
    - This isn't useful to users if the site is accurate
- Manual status bar is out of scope, I don't intend to actively manage this website constantly
    - However it will be good for outages, but on restarts it will reset so needs to be written to file
- Stop status listener if connected during stop but no update? - (I can handle this traffic, just greatly reduce the update time?)

## Username reading notes

I don't want to throw out my notes but a lot has changed during this time; new tech, new theories etc.
I'll prob write this AFTER I do Rust updates but a programmatic test will show how necessary this solutions are. This was initially written when I tested images 1-by-1, and because of obscuring & video compression there's no way EVERY frame can get 100% name accuracy.
All that matters is 100% accuracy over every alias, every NEAR match and the WHOLE event.

### OLD USERNAME NOTES

Ok lets talk about what prevents the list from being 100% accurate. 
1. Tesseract's inability to 100% determine the right characters, even when text is fairly* clear.
2. Inability to 100% accurately isolate & binarize usernames from the background.
3. Inability to recognize and remove the "Twitch chat box" that obscures some usernames & other obstacles
4. Determining the accurate length of the usernames to prevent the reading of usernames behind text

Now, I want to talk about each problem, theoritical solutions, current solutions and etc.

### Tesseract

Tesseract has a few options, but it's a little hard to test since there are many differences in usernames & screenshots that I need to use a programmatic test in order to determine how text accuracy. I have seen Tesseract reliably misjudge the letter r since the flick at the top is rarely kept.
So is that an isolate issue? Probably? But I've seen some accuracy issues running the same image with different modes.

Other than that Tesseract being a black box makes things a bit easier since I can't program a better solution. Well....
I could write my own AI for this particular Roboto text; but thats a really really truly dumb idea.
(It's probably an isolate issue.)

### Twitch chat box & other obstacles

So on Barb's stream, there is a high chance that the 1st 6-8 usernames are obscured by twitch chat. If I perfectly remove Twitch chat somehow, it would still be unreadable to Tesseract.

I considered overlaying multiple samples to account, but this doesn't account for big obstructions (SNAKEY, Barb, images, etc) and since there's a delay in populating due to the bot; I can no longer assume the 1st 6-7 usernames remain constant.
Especially with the new transparent chat window that won't even identify usernames behind it.
Therefore I'm shelving the issue until I have more information or a better solution.

### Accurate Username text
So a majority of the power goes into isolating usernames from background. Going through every single part logic that does this is time-consuming, so I'll talk about the improvements instead.

- Upgrade the username ingest by looking at the !play indicator at the end (but only when reaching the last 200)

#### Username length
I not going to go over the heuristics for getting the username length. Lets summarise that the program tries to figure out the max letters from the left and tries to stop & remove obstacles.
Background doesn't work (I did the math*) cause of bitrate; but I did try; although I didnt do it programmatically. 
Also this is the ONLY solution possible; because of the 11 kerning; there's a lower limit on the kerning space, it doesn't work on very dark backgrounds; kerning is hard to do without my own software.

#### Time scaling
As talked about before, overlaying each index capture "should" improve how accurate the capture is.
Also I will not do that; cause it's more pixel manip & I think the other options are better.

#### Sampling improvements
I'm currently implementing my strat of painting the samples, automatically getting them via PixCompare then building an OBB using minBoundingBox.py

I think any other significant improvements would be to computationally intensive, so I'm not doing it

#### Name verification
    I can verify names by looking at !PLAY icon to the right- but I dont think this is useful OUTSIDE the case at the end if a in-game username overlaps with the right position
    I'm leaving this as its an edge-case and it only pollutes the username length/memory; its not breaking.

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
