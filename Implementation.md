# Implementation
---
Writing down stuff thats not actionable but descriptive here

# Server summary
How the server works

Has multiple states depending on whether the game is detected, names are available, etc.
There's no main reason to go through these steps

## Tracking Summary
---
Ok quick summary of how the overall name tracking works

1. Open stream when the stream game is Marbles On Stream
2. Wait until the pre-race screen is detected
3. Start the per-frame tracking
4. If no names are detected for N seconds, go to stop (or other system)


## Screen State
I'm gonna summarize this as I've written this too many times
FYI the current system is doing NONE of this

Screen State needs to verify what is currently on the screen.
1. Verify if a frame contains new usernames
2. Verify parts of the UI to see how much of the screen is visible
3. Verify Barb position
4. Check if chat / !play is detected and where
5. Check alert (text or covered UI) position

This relies a crazy mix of detection, state persistence (alerts are not constant) and completely new methods of on-screen detection.
I still don't have any method of image checking over a variable position so it's just way out of scope.
Using a "get as many tracked usernames" as possible is good enough since the only thing screenstate provides is
    - Extra details on current screen state
    - Syncs with prediction (which is not available)
    - Reduces redundant checks

### Overlap/UI checking
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



# Per-Frame work
This covers the per-frame work 
## Username timings
------------------------------------------------------------
From 1 minute test
Color Avg: 0.40ms
Quick length Avg: 0.06ms 
Length Avg: 0.39ms

From full 5 min test
Color Avg: 0.51ms
Quick length Avg: 0.06ms 
Length Avg: 0.39ms

## Discontinuity/Stitching (DEPRIORITIZED)
Here's how this works;
1. When no offset can be found BUT a length can be found, create an discontinuity tracker at that position, then shift the entire screen down.
2. As the screen continues to get filled*, server tries to stitch the disconnect back together but only if length matches, not trying to fill gaps of null.
    This handles a full screen disconnect (i.e overlay/bitrate cant see screen and full update) without the bug that server assumes top-half is already known while the bottom screen gets matched
3. If a match is found, remove disconunity marker and add the results of the predictedUsers together
4. Otherwise, once the entire 2nd screen is populated (a stitch cannot be made), discontinue trying to stitch.

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

## Edge tracking
Huge issue is that left side tracking can spread the line across 2-3 pixels
    This makes pixel calculations very hard on the left side

The best solution is detecting the cliff regardless of channel value in 

### Notes about tracking changes
End result is that I don't have a linear or exponential function BECAUSE of the 
2-3 pixel blur, so these values don't work
***
0 avg tends to 180, 
[80,100,127] -> [180, 207, 239] (100)
[0,0,89] -> [160,160,255]
[170] -> [230]
[111] -> [170]




# Rust testing
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

## Objectives
The goal is a resilent, fast and testable accurate service for this job.
1. Pixel manipulation in Rust (lambda)
3. Improve name recognition by detecting behind the chat box
2. Separate stream download/cutting so the main server can handle requests and crashes without comprimising the name grabbing process
4. Improve name recognition by temporal adding of images and better name indexing
5. Add Website features like better response time, time to recognize, etc

## Rust Conclusion
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

## Native tesseract 
Native tesseract (also v5?)
592.755499958992ms
590.9905000329018ms
579.6887000203133ms

WASM
1594.7734000086784ms
1630.4746000170708ms
1634.950100004673ms

nearly x3 speedup


# OCR Notes
I'm not gonna write so much, but I think doing a manual OCR would be a huge speed-up. However I don't need to go down that rabbit hole right now.

I can start this with numbers only, and I can write this in Rust since I have external command support with lambda and etc.
Details are not really necessary right now.

## Manual OCR
Making one of these would be significantly faster, and also much more accurate than normal.
This however is a blackhole that I'm avoiding if possible.
But if I were to do it, I'll
1. Make a program that can split glyphs apart vertically
2. Pull each glpyh into an image and save on file
3. Use some dumb algorithm to build a program for detecting these images quickly
4. Actually time and use it in the server

Will put more details if I ever get to doing this (it would be useful) but just no right now.


# Video/Image download for testing

Instead of adding links here, I've downloaded the vods to the testing folder.
This will just contain commands since ffmpeg is a goddamn mess.

I've also edited the command a lot, doesn't need extra notes.

## FFMPEG stuff
ffmpeg -i "C:\Users\<user>\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4

## Streamlink Commands

streamlink <vod> <quality>

streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2 -pix_fmt rgba -vf fps=fps=1/2 -y -update 1 live.png

streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -copyts -f image2 -pix_fmt rgba -vf fps=fps=1/2 -frame_pts true %d.png

streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -vf fps=2 test.ts

### Raw vod
streamlink "https://www.twitch.tv/videos/2380046742?t=6h8m51s" "best" --stdout | "C:\Program Files\Streamlink\ffmpeg\ffmpeg.exe" -re -f mpegts -i pipe:0 -vf test.ts

## FFMPEG commands

ffmpeg -re '-f','mpegts', '-i','pipe:0', '-f','image2', '-pix_fmt','rgba', '-vf','fps=fps=1/2', 'pipe:1'

  Explaining ffmpeg mysteries
    streamlink       = (program for natively downloading streams)
    <twitch-vod url> = S.E
    best             = streamlink quality option
    --stdout         = output stream to the stdout pipe

    ffmpeg
    -re = read at the native readrate (so realtime)
    ~~-f mpegts = the input encoded pipe media format (for Twitch)~~
    -f image2pipe = converts video to images
    -i pipe:0 = input is stdin (from previous pipe)
    -f image2 = use the image2 encoder (for files)
    -pix_fmt rgba = output png is rgba (32 bit depth)
    -vf         = video filters or something
        fps=fps=1/2 = create a screenshot 1/2 per second (2 times a second)

        fps=30 = 30 frames per seconds
    -y          = do not confirm overwriting the output file
    -update     = continue to overwrite the output file/screenshot
    <screenshot.png> = output filename

    streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2pipe -pix_fmt rgba -c:v png -vf fps=fps=1/2 pipe:1

    Explaining more commands
    -f image2pipe = if you pipe image2, its gets mad and crashes
    -c:v png    = video output is png
    pipe:1      = output to stdout


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
