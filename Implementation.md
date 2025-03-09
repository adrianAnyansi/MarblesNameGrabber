# Testing

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


# Video/Image download for testing

https://www.twitch.tv/videos/2368542002?t=6h8m5s
https://www.twitch.tv/videos/2349366019?t=6h7m47s

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
    -f mpegts = the input encoded pipe media format (for Twitch)
    -i pipe:0 = input is stdin (from previous pipe)
    -f image2 = use the image2 encoder (for files)
    -pix_fmt rgba = output png is rgba (32 bit depth)
    -vf         = video filters or something
        fps=fps=1/2 = create a screenshot 1/2 per second (2 times a second)
    -y          = do not confirm overwriting the output file
    -update     = continue to overwrite the output file/screenshot
    <screenshot.png> = output filename

    streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2pipe -pix_fmt rgba -c:v png -vf fps=fps=1/2 pipe:1

    Explaining more commands
    -f image2pipe = if you pipe image2, its gets mad and crashes
    -c:v png    = video output is png
    pipe:1      = output to stdout


# Font and OCR tracking
