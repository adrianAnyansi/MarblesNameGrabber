# TODO.md

## todo today

Seperate the server from the router so I can test different frameworks easily
(Ok Express is good enough for me, I wasn't running production and now the response time went 2000ms > 1000ms)

Improve the logging so I don't write a bunch while iterating

Write the auto-quit function for username parse

Then work on the image recogn page probably



    1. Sketch up front page of website
        Figure out how/where to put Status
        
        Status: 1. Running 2. Users found 3. Viewers online

        - Create a new user-only route for the user+ranking

    2. Do simple get/fetch of username 
        (yes/probably/unlikely/no) 
        Show more info (find page)

    3. Add extra pages (footer) (home, about, identify)
        - Advanced search can just be a modified identify

        server queues request then sends name to target
        (req_id, img, name, )

    4. Do the full page by image for the debug admin
    5. Continue with the user defined images and figure out server+interface

---

## Server Notes
    Eventually I have to do the tests and run this on a server.
    Here are the steps
    1. Install and test run streamlink + ffmpeg for performance
    2. Pull git, start using the NPM (p2m or smth)
    3. Install nginx, start putting the static content in S3 & routing
    4. Do the Route53 stuff & test stuff
    5. Buy a domain or something

## Server setup notes

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
## Thoughts

At this point, the recognition is about the best I can consider.
There are some things that can be tweaked;
    - Tweak the color values
    - Mess with anti-flood fill
    - Recognize and remove the pointer (cause Barb literally can't give me a break)
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
