# TODO.md

## todo today
Show marbles ingest date? (terrible for testing, would need to be manually updated) 

Stop status if connected during stop but no update? - I can handle this traffic, just greatly reduce the update time?

Server startup
    3/10 didn't start up, manual start -> stop -> start 
        Twitch monitor worked on 29/9, maybe there were errors with Twitch?. 
        Marbles bot worked; so I updated with the game_id to hopefully fix that issue.

## todo later
- Do the full page by image for the debug admin

Website
    Verify new_img logic
    Verify Logic
        Retrieve - Get request+id+name?
            New_img / old_img
            1. What is this username?
                Input + Button (you must type input from nothing to prevent dummies)
        Send back to server

Server
    Logging improvement for response times
    Reduce memory stuff (memory)
        Think about reducing the images used based on confidence 
        Or only save unique names to prevent pile-up of data

    START/STOP AUTH
    Verify image backend 
        request_id + info (in set)
        if 1, add to verified (only if username is not taken)
        once info has 2 similar results, add to verified

Server stability
    Caching levenDistance answers (for user queries)? 
    // Don't think this is necessary due to the lambda removing a lot of the processing from the server

## Bugs

## Thoughts
The list transition took significantly less time than expected. Writing some notes to talk about next steps.

# General Notes

Ok lets talk about what prevents the list from being 100% accurate. 
1. Tesseract's inability to 100% determine characters, even when text is fairly* clear.
2. Inability to 100% accurately isolate & binarize usernames from the background.
3. Inability to recognize and remove the "Twitch chat box" that obscures some usernames
4. Determining the accurate length of the usernames

Now, I want to talk about each problem, theoritical solutions, current solutions and etc.

## Tesseract

Tesseract has a few options, but it's a little hard to test since there are many differences in usernames & screenshots that I need to use a programmatic test in order to determine how text accuracy. I have seen Tesseract reliably misjudge the letter r since the flick at the top is rarely kept.
So is that an isolate issue? Probably? But I've seen some accuracy issues running the same image with different modes.

Other than that Tesseract being a black box makes things a bit easier since I can't program a better solution. Well....
I could write my own AI for this particular Roboto text; but thats a really really truly dumb idea.
(It's probably an isolate issue.)

## Twitch chat box

So on Barb's stream, there is a high chance that the 1st 6-8 usernames are obscured by the name.
Even with perfect isolation, Twitch chat will be on top of it. Now a human can easily see this and interpolate the shapes to recreate the letters underneath. But that's a difficult problem for the computer (aka me) to do.
Let's say I determine a way to detect the Twitch box and I've able to remove it from my output. Not only does this add a decent amount of processing to the image binization, but the only thing is provides is discovering the first 6-8 names (due to the fact that all other names are shown below this box at some point due to scrolling)

But there's a solution; if I take the same index and overlap them, I can determine the text by looking at pixels that show up multiple times. This works also for text destroyed by bitrate issues, so its a useful tool.
There's only the issue that I can't confirm 2 indexes are the same until the first page is complete. This typically means I only have 2-3 samples to build these with; and testing if its worth it is the same as making it due to how intensive it is.

---
This is the 1st situation of Barb specific solutions that I can consider.
But for options of detecting and removing the chat box, I know the approximate box that the chatbox is in, I have to start getting all the colours of the Twitch chat & the badges and soooooooo much more. 
In an ideal world, I would detect the chat window; remove it, perform this temporal resolution and get a perfect result. But seeing as this relies on the obstacle problem (which can be temporary or not) this is not a general case solution regardless., and its only for those 6-9 usernames.
So for that reason, I think manually determining the image is a cheaper & simpler solution; and the isolate topic will talk about that. 

## Accurate Username text
So a majority of the power goes into isolating usernames from background. Going through every single part logic that does this is time-consuming, so I'll talk about the improvements instead.

### Username length
I not going to go over the heuristics for getting the username length. Lets summarise that the program tries to figure out the max letters from the left and tries to stop & remove obstacles.
However the initial idea which I shelved long ago is actually determining the background due to the partially transparent black background. This is the most reliable way to determine it. And I think if I look at the RGBA multiplier, I should be able to determine the exact pixel difference and know exactly where the username ends, assuming the background is similar.

### Time scaling
As talked about before, overlaying each index capture "should" improve how accurate the capture is.
Also I will not do that; cause it's more pixel manip & I think the other options are better.

### Sampling improvements
So the current samples used for the program are manually done, and use a somewhat naive comparison to check it against the base colour. The idea is to overlay the same exact computer-generated text but in another image; then programmatically determine the samples. This probably won't have a significant improvement but the addition of this is a modification of the comparison mechanicism.

I plan to create a collision box that more strictly restricts itself to better identify valid colours.
To explain in a simple way, instead of drawing a circle to fit a bunch of points, maybe a bunch of circles will better fit the area that those points cover.


---

## Server setup notes
// I installed a bunch of other things- but didn't save the other commands.
// I added PM2, nginx and a few other things. Should probably save the bash history
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


---
## Past Thoughts

At this point, the recognition is about the best I can consider.
There are some things that can be tweaked;
    - Tweak the color values
    - Mess with anti-flood fill
    - Recognize and remove the cursor/pointer (cause Barb literally can't give me a break)
    - Figure out ways to remove/ignore white text from Twitch chat
    - Mess with more blurring (I think scaling matches tests done)
    - timestamp pictures taken
    - timestamp when the names are recognized

Bigger projects
    - Manually paint sampling points to improve recogn
    - Weigh the points, restrict the points by a better collision detection
        - Anti-sampling points?
    - Maybe do some automating tests for tests

# MVP - Able to run on my local machine

## Text binarization 
0. Output each name boundary to an object; so another function can handle it
1. Flood-fill, mark valid px with a:254; on edges mark as a:253, other is a:0
2. create new buffer, copy px to gray scale while boosting values to black(max)
    debug: write buffer to text
    a. Add samples for mod, vip & streamer colors

## Buffer to OCR pipeline
3. Test tesseract with bin image
    tweak: for better output
4. Test tesseract with buffer
5. Link img process to tesseract path
6. Test run with vod output + timing

## Run as server
7. Build server components + memory database
8. Create child process for streamlink
9. Build routes
10. Test server to run independently

11. Start building webpage and UI
12. Attach server to 



# VOD  NOTES streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m35s" best

39:42 Game loads, names immediately start populating, half way down the page (chat covers ~10 names)
39:45 Name list is full [Quarktos] 
39:48 Name begins to scroll [peepoJuice] (Quarktos is 17th)
39:49 Stop
39:50 Stop2 [SimkinPhd] (peepoJuice 6th)
39:54 Stop [BigZacEnergy] (17th)
39:55 Stop [dwarvendynamite] (6th)
39:59 Stop [flex_mentalo] (17th)
40:01 [JamesFnX] (6th)
40:04 [deltahedget0] (17th)
40:06 [Simbossa] (6th)
40:09 [rumham11] (17th) (ok you get it)
40:11 [jotabyte]
40:15 [Piemanlowa]
40:16 [The_Wollyhops]
40:20 [osnap]
40:22 [lawaccount1337]
40:25 [Goontek]
40:27 [alyssasketches]
40:30 [zarahAP]
40:32 [bagamuffin]
40:35 [AtomicNumber79]
40:37 [sung251]
40:41 [lbs0219]
40:43 [VinceAyne]
40:46 [Alex_Made_An_Account]
40:49 [Mr_GoonAndWatch]
40:51 [syhren]
40:53 [LenninG]
40:55 [RonDongler]
40:58 [Zw1ggy]
(not continuing, this will take 2 more minutes)
42:34 The last name is on screen.
