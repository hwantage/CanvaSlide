// Source language: every other locale must define exactly these keys (enforced by the type).
export const en = {
  'site.faq.productQ': 'What is {app}?',
  'site.faq.productA':
    '{app} is free, open-source presentation software built around an infinite canvas. Arrange text, shapes, images and diagrams in one space, draw frames around the views you want to show, and present by zooming between them. You can start from an editable example or create your own canvas.',
  'site.faq.framesQ': 'How do nested frames work?',
  'site.faq.framesA':
    'Draw a frame around a whole slide, then a smaller frame around a chart, table or detail inside it. Put the smaller frame next in the presentation order. The camera zooms into that area on the same canvas; the previous-frame control takes you back. This also works in exported {html} presentations.',
  'site.faq.figmaA':
    'Yes. Import a local {fig} file and choose editable text and shapes or preserved appearance. Supported text and simple shapes stay editable; complex artwork may become images. Some effects, layout rules and masks are not preserved exactly, so review the conversion report. You can also import images and {pdf} pages; each {pdf} page becomes an image.',
  'site.faq.platformQ': 'Does it work on {mac}, {windows} and the web?',
  'site.faq.platformA':
    'Yes. Desktop installers for {mac} and {windows} are available on the Releases page. You can also open the web editor in a browser without installing the app. In the browser, Chromium-based browsers save back to the opened {format} file, while Safari and Firefox download a copy; desktop export can embed subsets of installed fonts, while browser export depends on available fonts.',
  'site.faq.viewersQ': 'Do viewers need to install {app}?',
  'site.faq.viewersA':
    'No. Export your presentation as one {html} file and viewers can open it in a browser. The file contains the player, canvas content and embedded images. Keep the original {format} file for further editing; the exported presentation is for viewing. Linked videos still need their provider and network.',
  'site.faq.freeQ': 'Is it free? Do I need an account?',
  'site.faq.freeA':
    'Yes, {app} is free and open source. The desktop app works without an account, and your documents are files you save on your computer. You can try editable examples in the web editor without signing in, too.',
  'site.faq.title': 'Frequently asked questions',
  'site.faq.description': 'What it is, how it works, and what you need to get started.',
  'site.faq.nestedQ': 'How is it different from a slide-based presentation?',
  'site.faq.nestedA':
    'Your content stays together on one canvas instead of being split across separate slides. Frames define the views and their order, so you can show the big picture and zoom into a detail without duplicating content. You can also arrange frames like a familiar slide deck.',
  'site.faq.figmaQ': 'Can I bring in my {design} designs?',
  'site.faq.aiQ': 'How do I create a presentation with AI?',
  'site.faq.aiA':
    'Copy a prompt to an external AI assistant that can create files. Ask for an editable {format} file, open it in {app}, check the result and present or export {html}. The website and editor prepare the prompt; they do not send requests to an AI service.',
  'site.faq.cloudQ': 'Does a share link update as I edit?',
  'site.faq.cloudA':
    'No. Experimental cloud sharing creates a snapshot, not live collaboration. Later edits do not update the link. Anyone with the link can access it for 24 hours; there is no manual revocation. Keep a local editable copy or export {html} for a portable presentation.',
  'site.story.example': 'Open this editable example',
  'site.showcase.freefall.title': 'FREEFALL. One canvas. No cuts.',
  'site.showcase.freefall.body':
    'Follow ten camera stops from Earth to a city, into tiny details, then across a sea of concert lights and animated fireworks.',
  'site.showcase.freefall.alt': 'Earth seen from space with the FREEFALL title and nested details.',

  'site.showcase.inside.title': 'Inside the human body.',
  'site.showcase.inside.body':
    'Travel through thirteen frames of an illustrated anatomy presentation. Layered {svg} artwork and embedded photographs reveal details as you zoom.',
  'site.showcase.inside.alt':
    'An illustrated anatomy presentation with detailed organs and embedded photographs.',

  'site.docs.examples.title': 'Explore examples',
  'site.docs.examples.summary': 'Open ShowCase, follow a story, and save your own version.',
  'site.docs.examples.openHeading': 'Open a ready-made canvas',
  'site.docs.examples.openBody':
    'Choose a presentation in ShowCase and select Open in web editor. A new tab opens an editable copy. Select Slide Show ({present}) to follow its frames; use {overview} for the full canvas and {escape} to return to editing. On a small screen, open the panels from the top bar to see the frame list.',
  'site.docs.examples.saveHeading': 'Make it yours and save',
  'site.docs.examples.saveBody':
    'Edit text, move shapes, or change frame order without changing the original on the server. Use {save} to keep an editable {format} copy: Chromium-based browsers ask where to save it and write later saves to that file, while Safari and Firefox download a copy each time. You can also download the source from ShowCase and open it in the desktop app. Browser edits are not saved automatically. Reloading an example link opens the original again.',
  'site.docs.examples.linksHeading': 'Direct example links',
  'site.docs.examples.linksBody':
    'An editor URL with {query} opens the named example directly, including on refresh. Only catalog IDs work; a file path or another website URL cannot be used. If both a share link and an example ID are present, the share link takes priority. Loading can be cancelled. Unknown IDs and invalid files leave the current canvas unchanged; download failures offer a retry.',
  'site.docs.media.headline': '{design} presentations: import designs and {pdf}',
  'site.docs.media.title': 'Import & video',
  'site.docs.media.summary':
    'Build a presentation from a local {design} file. Import supported text and shapes, add {pdf} pages and linked videos, and check conversion limits before presenting.',
  'site.docs.media.filesHeading': 'Import images and pages',
  'site.docs.media.filesBody':
    'Choose Import file in the toolbar ({import}) or drop a file on the canvas. Images remain movable and resizable. Each imported {pdf} page becomes an image with a presentation frame; its text is not editable. You can undo the import as one action.',
  'site.docs.media.figmaHeading': 'Turn a local design file into a presentation',
  'site.docs.media.figmaBody':
    'Import a local {figma} {format} file, choose its pages, then choose Editable text and shapes or Preserve appearance. Editable mode keeps supported text and simple shapes editable; complex artwork becomes images. Preserve appearance makes top-level layers into images. Review the conversion report: effects, layout rules, component overrides, and some masks are not preserved exactly. No account or API token is required, and the source file stays unchanged.',
  'site.docs.media.videoHeading': 'Link a video',
  'site.docs.media.videoBody':
    'Use the video tool and paste a supported {youtube}, {vimeo}, or direct video URL. The document stores the link, not the video bytes. Select the video to adjust its playback options, then test it in Slide Show. Playback needs the provider and network; browser autoplay rules may require a click. {youtube} in an exported {html} presentation needs HTTP(S) hosting. The desktop app plays direct video files only from HTTPS links. Cloud snapshots allow the supported providers and direct videos on the share service’s own origin.',
  'site.docs.media.details': 'Read the design import limits',
  'site.docs.ai.title': 'Create with AI',
  'site.docs.ai.summary':
    'Create an AI-assisted presentation: copy a prompt to your external assistant, open its editable file, then review and export. No AI service is called by this page.',
  'site.docs.ai.promptHeading': 'Copy a brief to your assistant',
  'site.docs.ai.promptBody':
    'Start here with an introduction to the app. Choose General for eight slides with calm layouts and restrained camera movement, or Dynamic for eight scenes with varied camera views and nested zoom frames. The same prompt is available from Create with AI in the editor’s top bar.',
  'site.docs.ai.customizeHeading': 'Make the prompt your own',
  'site.docs.ai.customizeBody':
    'After pasting, replace the website address and introduction topic with your own source or subject. Specify your audience, language, scene count, tone, and output filename. For Dynamic, count close-up frames toward the total scene count. Keep the skill link so your assistant can follow the file format and authoring instructions. Use an assistant that can read the source and create files; if it cannot open a link, provide the content directly. This page prepares a prompt for your assistant; it does not send requests to an AI service.',
  'site.docs.ai.outputHeading': 'Choose the files you need',
  'site.docs.ai.outputBody':
    'By default, the prompt requests an editable {format} file. Enable Generate an {html} file to ask your assistant for both the editable original and a standalone presentation you can open in a browser. The checkbox adds this request to the prompt. You can also open the original in {app} and export {html} after editing. For offline playback, ask for embedded images and no externally linked videos.',
  'site.docs.ai.openHeading': 'Open and check the result',
  'site.docs.ai.openBody':
    'Ask for an editable {format} file and open it with {open}. If your assistant only returns JSON, save the complete JSON as UTF-8 with the correct extension. Check text, fonts, frame order, camera motion, and any media before presenting. Save the editable original even when you also export {html}. The authoring guide and optional skill describe the supported file format.',
  'site.docs.ai.guide': 'Read the authoring guide',
  'site.docs.ai.skill': 'View the authoring skill',
  'site.docs.frames.directionHeading': 'Direct each move',
  'site.docs.frames.directionBody':
    'Select a frame and open Camera in the properties panel. Duration sets travel time, easing shapes the pace, arc changes how far the camera pulls back, roll tilts the view, and spotlight dims the surrounding canvas. Controls show the resolved value, including inherited document settings. Reset restores the application defaults; a field without an override inherits the document setting. Motion marks in the frame list help find frames with non-default effects.',
  'site.docs.frames.batchHeading': 'Preview and adjust several frames',
  'site.docs.frames.batchBody':
    'Select several frames to apply a shared camera setting in one edit. Mixed values remain visible until you change that control. Use Preview to inspect the sequence while keeping editor controls available; Slide Show opens the presentation view. Reorder frames in the list to change the story without moving their content.',
  'site.docs.sharing.cloudHeading': 'Share a snapshot link',
  'site.docs.sharing.cloudBody':
    'Cloud sharing is experimental: the hosted service’s limits and availability depend on its {cloudflare} plan. Choose Share, then Edit a copy or View slide show only, and press Copy link. View-only links require at least one frame and open without editor controls. Anyone with the link can access the snapshot for 24 hours. Later edits do not update it, and there is no account, manual revocation, or live collaboration. The snapshot limit is {limit}, including embedded images. When sharing is unavailable or too large, save locally or export {html}. Viewing-only controls do not prevent copying content.',
  'site.docs.sharing.fontHeading': 'Check fonts and linked media',
  'site.docs.sharing.fontBody':
    'Desktop export can embed subsets of installed fonts. Browser export depends on available fonts; check the presentation on the receiving device. Embedded images and the player travel with the {html} file, but linked videos still need their host and network. Keep an editable {format} original for later changes.',
  'site.hero.editor': 'Open the web editor',
  'site.showcase.meta': 'Presentation Examples — {product} ShowCase',
  'site.showcase.description':
    'Step inside a presentation. Follow its frames, explore the whole canvas, and edit a copy in your browser. No installation or account needed.',
  'site.showcase.homeTitle': 'See where a canvas can take you.',
  'site.showcase.browse': 'Browse all examples',
  'site.showcase.open': 'Open in web editor',
  'site.showcase.openNamed': 'Open {name} in the web editor',
  'site.showcase.download': 'Download source',
  'site.showcase.guide': 'How to explore and save an example',
  'site.showcase.featured': 'Start here · A story across one canvas',
  'site.showcase.featuredOpen': 'Open One order, all the way in the web editor',
  'site.showcase.instructions':
    'Examples open in a new tab. Choose Slide Show to follow the frames, or edit right away. Download the source for the desktop app. Most examples are in English; the AI-generated introductions are in Korean. Save your edits before closing or reloading.',
  'site.showcase.one-order.title': 'One order, all the way.',
  'site.showcase.one-order.body':
    'Follow a checkout through a payment timeout and a safe retry. Twenty-three frames connect the system map to the details of one request.',
  'site.showcase.one-order.alt':
    'An order journey with a system map, request envelope, payment and receipt.',
  'site.showcase.swing.title': 'Across the skyline.',
  'site.showcase.swing.body':
    'Twelve camera stops across a wide illustrated city. Explore long flights, changes in scale, and the rhythm of a spatial story.',
  'site.showcase.swing.alt': 'An illustrated city arranged along a sweeping presentation route.',
  'site.showcase.anatomy.title': 'From the body to a cell.',
  'site.showcase.anatomy.body':
    'An atlas and a standing figure share one canvas. Follow twenty frames from the big picture into nested anatomical details.',
  'site.showcase.anatomy.alt': 'An anatomical atlas beside a full standing human figure.',
  'site.showcase.flowchart.title': 'Make the process visible.',
  'site.showcase.flowchart.body':
    'Decisions, exception branches, and retry loops turn order fulfillment into a connected flow. Inspect three stage frames and editable connectors.',
  'site.showcase.flowchart.alt':
    'An order fulfillment flowchart with decision branches and retry loops.',
  'site.showcase.erd.title': 'See the relationships.',
  'site.showcase.erd.body':
    'Seven tables, cardinality labels, and four cluster frames explain a shop schema. Move a table to see its attached connectors follow.',
  'site.showcase.erd.alt': 'Seven database tables linked in an entity relationship diagram.',
  'site.showcase.slides.title': 'A launch, with room to zoom.',
  'site.showcase.slides.body':
    'A familiar launch deck opens into a connected canvas. Seven frames include a process, pilot results, a close-up chart, and a roadmap.',
  'site.showcase.slides.alt':
    'A launch deck with a results chart and roadmap arranged on one canvas.',
  'site.showcase.architecture.title': 'Trace a system.',
  'site.showcase.architecture.body':
    'Explore a shop platform in four zones. Solid request paths and dashed event routes keep services and their relationships readable.',
  'site.showcase.architecture.alt': 'A cloud architecture diagram divided into service zones.',
  'site.showcase.mindmap.title': 'Give a strategy space.',
  'site.showcase.mindmap.body':
    'A central idea branches into five color-coded themes. Follow curved connectors and six frames to explain the plan one area at a time.',
  'site.showcase.mindmap.alt': 'A product strategy mind map with five colored branches.',
  'site.showcase.canvaslide-claude.title': '{app} · {claude}',
  'site.showcase.canvaslide-claude.body':
    'An introduction to {app} created by {claude} from an AI prompt. Eight editable scenes in Korean explore the canvas, frames, camera direction, and sharing.',
  'site.showcase.canvaslide-claude.alt':
    'The Korean cover of a {claude}-generated {app} introduction.',
  'site.showcase.canvaslide-codex.title': '{app} · {codex}',
  'site.showcase.canvaslide-codex.body':
    'An introduction to {app} created by {codex} from an AI prompt. Eight editable scenes in Korean connect the big picture with detail zooms, creation, and sharing.',
  'site.showcase.canvaslide-codex.alt':
    'The Korean cover of a {codex}-generated {app} introduction.',
  'site.showcase.one-order.try':
    'Try the overview, then zoom into the payment retry. Every shape and connector is editable.',
  'site.workflows.title': 'Bring more into your story.',
  'site.workflows.description':
    'From the first idea to the final presentation, keep the detail and the context together.',
  'site.workflows.motion.title': 'Make a zooming presentation.',
  'site.workflows.motion.body':
    'Set the pace, arc, roll, and spotlight for each frame. Preview a move or adjust several frames together.',
  'site.workflows.import.title': 'Start with what you have.',
  'site.workflows.import.body':
    'Bring in {design} files, {pdf} pages, and images. Add linked video when your story needs motion.',
  'site.workflows.share.title': 'Choose how to share.',
  'site.workflows.share.body':
    'Send a 24-hour snapshot link for viewing or editing a copy. Export {html} for a portable presentation.',
  'site.workflows.ai.title': 'Begin with an AI prompt.',
  'site.workflows.ai.body':
    'Copy a General or Dynamic brief to your own assistant, then open its editable presentation here.',

  // Website documentation.
  'site.docs.title': 'Documentation',
  'site.docs.intro': 'From your first canvas\nto your next presentation.',
  'site.docs.description':
    'Everything you need to get comfortable, find your flow, and share a story worth following.',
  'site.docs.search': 'Search the guides…',
  'site.docs.searchLabel': 'Search documentation',
  'site.docs.empty': 'No guides found. Try “frames”, “save”, or “install”.',
  'site.docs.clear': 'Clear search',
  'site.docs.browse': 'Browse guides',
  'site.docs.startGroup': 'Get started',
  'site.docs.createGroup': 'Create & present',
  'site.docs.referenceGroup': 'Reference',
  'site.docs.onPage': 'On this page',
  'site.docs.previous': 'Previous guide',
  'site.docs.next': 'Next guide',
  'site.docs.edit': 'Suggest an improvement',
  'site.docs.time': '{minutes} min read',
  'site.docs.overview.title': 'Welcome',
  'site.docs.overview.summary': 'A quick introduction to the canvas, frames, and your next story.',
  'site.docs.installation.headline': 'Free presentation software for {mac} and {windows}',
  'site.docs.installation.title': 'Installation',
  'site.docs.installation.summary':
    'Download free presentation software for {mac} and {windows}, or try the web editor without installing. Set up desktop editing and presenting with local files.',
  'site.docs.quick-start.title': 'Your first presentation',
  'site.docs.quick-start.summary': 'Go from a blank canvas to a short presentation in six steps.',
  'site.docs.canvas.title': 'Explore the canvas',
  'site.docs.canvas.summary': 'Move around, zoom in, and keep your whole idea in view.',
  'site.docs.editing.title': 'Create & edit',
  'site.docs.editing.summary': 'Work with text, shapes, images, and connections.',
  'site.docs.frames.headline': 'Zooming presentations with nested frames',
  'site.docs.frames.title': 'Frames & presenting',
  'site.docs.frames.summary':
    'Create a zooming presentation on an infinite canvas: arrange nested frames, move from overview to detail, and control the camera without duplicating slides.',
  'site.docs.sharing.headline': '{html} presentations and offline sharing',
  'site.docs.sharing.title': 'Save & share',
  'site.docs.sharing.summary':
    'Export an {html} presentation with a built-in player, present embedded content offline in a browser, and keep an editable original. Learn the font, video and sharing limits.',
  'site.docs.shortcuts.title': 'Keyboard shortcuts',
  'site.docs.shortcuts.summary': 'Keep your hands on the keyboard and stay in your flow.',
  'site.docs.faq.title': 'Common questions',
  'site.docs.faq.summary': 'A few useful answers before you get going.',
  'site.docs.overview.canvasHeading': 'A place to think freely.',
  'site.docs.overview.canvasBody':
    'Start with an infinite canvas. Place text, shapes, and images wherever they make sense. Zoom out to see relationships, or zoom in to work on a detail.',
  'site.docs.overview.frameHeading': 'A frame is a moment.',
  'site.docs.overview.frameBody':
    'Frames mark the areas you want to present. Arrange them in an order, and the camera travels between them with a continuous zoom and pan. Your canvas stays in place; your perspective moves.',
  'site.docs.overview.startHeading': 'Start with something small.',
  'site.docs.overview.startBody':
    'Three ideas and three frames are enough for your first story. The quick-start guide walks you through it, from an empty canvas to a saved presentation.',
  'site.docs.install.availableHeading': 'Get the desktop app',
  'site.docs.install.availableBody':
    'Download the installer for your operating system from the official Releases page. Current builds are not OS code-signed, and macOS builds are not notarized. The steps below apply to builds downloaded from that page. You can also try the web editor without installing anything, or build the app from source below.',
  'site.docs.install.macBody':
    'Open the {dmg} file, then drag the app into Applications. Launch it from Applications. The app requires {platform} {version} or later. If you see “CanvaSlide is damaged and can’t be opened”, open Terminal and run xattr -d com.apple.quarantine /Applications/CanvaSlide.app, then reopen the app. For an unidentified-developer or Apple-cannot-check-for-malware warning on {platform} 15 or later, close the alert, open System Settings → Privacy & Security, click Open Anyway next to CanvaSlide and confirm. On {platform} 12–14, Control-click (right-click) the app in Finder and choose Open.',
  'site.docs.install.windowsBody':
    'Run the {exe} or {msi} installer from the release assets. If SmartScreen shows “Windows protected your PC”, click More info → Run anyway, then follow the setup steps. Launch the app from the Start menu. If the installer asks to install WebView2, complete that step.',
  'site.docs.install.sourceHeading': 'Build from source',
  'site.docs.install.sourceBody':
    'You can also run the current app from source. Install Git, {node} {version} or later, the repository’s pinned {packageManager}, and the stable Rust toolchain. Complete the platform setup in the Tauri prerequisites guide first.',
  'site.docs.install.prerequisites': 'Platform prerequisites',
  'site.docs.install.buildHeading': 'Create an installer',
  'site.docs.install.buildBody':
    'Build on the operating system you want to distribute for. The installer is written into the platform’s bundle directory. This creates a local build without OS code signing.',
  'site.docs.copy': 'Copy command',
  'site.docs.copied': 'Copied',
  'site.docs.copyFailed': 'Select the command and copy it manually.',
  'site.docs.quick.newHeading': 'Start a new canvas',
  'site.docs.quick.newBody':
    'Open the app and create a new document with {shortcut}. Start with a simple topic: a plan, a lesson, or three things you want to explain.',
  'site.docs.quick.addHeading': 'Put an idea on the canvas',
  'site.docs.quick.addBody':
    'Press {text} and click to add text. Press {rectangle} and drag to draw a rectangle. Paste a copied image with {paste}. Move things around until the layout feels right.',
  'site.docs.quick.framesHeading': 'Make three frames',
  'site.docs.quick.framesBody':
    'Press {key} and drag around your first idea to create a frame. Repeat for two more ideas. Give each frame a useful name in the frame list.',
  'site.docs.quick.orderHeading': 'Choose the order',
  'site.docs.quick.orderBody':
    'Drag the frame rows in the frame list to rearrange the sequence. Try a wide overview first, then move closer to the details.',
  'site.docs.quick.presentHeading': 'Follow your story',
  'site.docs.quick.presentBody':
    'Start the slideshow with {shortcut}. Use {next} for the next frame and {previous} for the previous one. Press {escape} to return to editing.',
  'site.docs.quick.saveHeading': 'Save your first presentation',
  'site.docs.quick.saveBody':
    'Use {shortcut} to save an editable {format} document. Choose a name and a folder you can find again. Save regularly as you work.',
  'site.docs.canvas.panHeading': 'Move around',
  'site.docs.canvas.panBody':
    'Hold {space} and drag to pan. You can also select the hand tool with {hand}, use the middle mouse button, or scroll with a trackpad.',
  'site.docs.canvas.zoomHeading': 'Get closer, step back',
  'site.docs.canvas.zoomBody':
    'Pinch on a trackpad, or hold your primary modifier while scrolling to zoom around the cursor. Use {zoomIn} and {zoomOut} to zoom by keyboard. {reset} returns to the default zoom level.',
  'site.docs.canvas.findHeading': 'Find the bigger picture',
  'site.docs.canvas.findBody':
    'Use {fit} to fit your content into view. Click a frame in the frame list to select it and jump to its area. A frame is a view into the same canvas, not a separate document.',
  'site.docs.edit.textHeading': 'Text, shapes, and images',
  'site.docs.edit.textBody':
    'Use {text} for text, {rectangle} for a rectangle, {ellipse} for an ellipse, and {diamond} for a diamond. Draw a triangle with the Triangle tool in the toolbar. Double-click text to edit it. Copy an image and paste it with {paste}. Use the properties panel to adjust fill, borders, and text styling.',
  'site.docs.edit.arrangeHeading': 'Select and arrange',
  'site.docs.edit.arrangeBody':
    'Press {select} for the selection tool. Drag on empty space to select several elements, or hold {shift} to add to a selection. Move and resize with the handles, and drag the round handle above a selection to rotate it; hold {shift} to turn in {step} steps. The alignment controls help line up elements and distribute them evenly.',
  'site.docs.edit.connectHeading': 'Make a connection',
  'site.docs.edit.connectBody':
    'Press {key} for the connector tool. Drag between shapes to connect them. Attach an end to a side port or to the shape itself; the line follows when the shape moves. Choose straight, elbow, or curved lines in the properties panel, and pick the start and end shapes separately, such as an arrow, a circle, or none.',
  'site.docs.edit.undoHeading': 'Try things freely',
  'site.docs.edit.undoBody':
    'Duplicate selected elements with {duplicate}. Copy and paste them between documents with {copy} and {paste}. Undo with {undo} when you want to take a step back.',
  'site.docs.frames.makeHeading': 'Create a frame',
  'site.docs.frames.makeBody':
    'Choose the frame tool with {key}, then drag over the area you want to show. Frames can have different sizes and can overlap. Moving a frame carries the elements inside it.',
  'site.docs.frames.orderHeading': 'Shape the sequence',
  'site.docs.frames.orderBody':
    'Use the frame list to drag frames into order. Double-click a frame name to rename it. Start with an overview, then add close-ups, or try another order that fits your story.',
  'site.docs.frames.presentHeading': 'Present your canvas',
  'site.docs.frames.presentBody':
    'Start with {start}. Advance with {next}; go back with {previous}. Press {escape} to close the tools, return from overview, or leave the slideshow. The camera fits each frame into the window and animates the move between frames. The control bar leaves the screen while you present and comes back when the pointer reaches the bottom edge of the window. The same controls and temporary ink are available in the app and new exports. Press {pointer} to point, drag to draw, and {erase} to erase. Small screens keep these actions in Tools. Ink stays when pointing stops or overview returns to the same frame; another frame or ending the show clears it. Ink is never saved in the document.',
  'site.docs.frames.timingHeading': 'Set the pace',
  'site.docs.frames.timingBody':
    'Open Settings with {settings} and adjust the transition duration from {range}. That is the document default, and every frame uses it until you give one its own: select a frame and the Camera section of the properties panel overrides the duration, easing, arc, roll and spotlight for the move into that frame. Set a duration to zero for an instant change.',
  'site.docs.sharing.saveHeading': 'Keep the editable original',
  'site.docs.sharing.saveBody':
    'Save with {save} as a {format} file. Use {saveAs} to save a copy under a new name, and {open} to reopen a document. The file contains the canvas, frame sequence, settings, and embedded image data.',
  'site.docs.sharing.exportHeading': 'Export a presentation',
  'site.docs.sharing.exportBody':
    'Open the export dialog with {export} and choose a format. {html} gives one self-contained file with your presentation and a built-in player, after you review the image quality options and estimated file size. {pdf} gives one page per frame in presentation order, each page shaped like its frame, at the page resolution you pick. Pages are rendered as images, so their text is not selectable and videos appear as a still.',
  'site.docs.sharing.playHeading': 'Present offline in a browser',
  'site.docs.sharing.playBody':
    'Open the exported file in a browser. Embedded content works offline, and the viewer does not need the desktop app. Linked videos need a network connection and may require HTTP(S) hosting. Use the player navigation or arrow keys, and open its overview to jump to a frame. HTML keeps its light theme and English interface, with the same auto-hiding controls, laser and ink tools. Existing distributed files need regeneration to receive player updates.',
  'site.docs.sharing.tip':
    'Keep the original canvas file if you want to edit later. Image-heavy presentations can make larger files; adjust export quality when sharing.',
  'site.docs.shortcuts.heading': 'A few keys go a long way.',
  'site.docs.shortcuts.body':
    'Shortcuts below match this device. Use the primary modifier on your platform: Command on macOS, Control on Windows.',
  'site.docs.shortcuts.action': 'Action',
  'site.docs.shortcuts.keys': 'Shortcut',
  'site.docs.shortcuts.new': 'New canvas',
  'site.docs.shortcuts.open': 'Open a document',
  'site.docs.shortcuts.save': 'Save',
  'site.docs.shortcuts.saveAs': 'Save as',
  'site.docs.shortcuts.export': 'Export presentation',
  'site.docs.shortcuts.present': 'Start slideshow',
  'site.docs.shortcuts.presentFromSelection': 'Slide show from current frame',
  'site.docs.shortcuts.copy': 'Copy / paste',
  'site.docs.shortcuts.duplicate': 'Duplicate',
  'site.docs.shortcuts.undo': 'Undo',
  'site.docs.shortcuts.select': 'Select / hand',
  'site.docs.shortcuts.text': 'Text / rectangle / ellipse / diamond',
  'site.docs.shortcuts.frame': 'Frame / connector',
  'site.docs.shortcuts.fit': 'Fit all content',
  'site.docs.shortcuts.zoom': 'Zoom in / out',
  'site.docs.shortcuts.help': 'Keyboard shortcuts (editor)',
  'site.docs.shortcuts.next': 'Next / previous frame',
  'site.docs.shortcuts.overview': 'Toggle overview (slideshow)',
  'site.docs.shortcuts.pointer': 'Toggle laser pointer — drag to draw (slideshow)',
  'site.docs.shortcuts.clearInk': 'Erase all ink (slideshow)',
  'site.docs.shortcuts.exit': 'Exit slideshow',
  'site.docs.faq.accountQ': 'Do I need an account?',
  'site.docs.faq.accountA':
    'No. The desktop app works without signing in. Your documents are files you save on your computer.',
  'site.docs.faq.offlineQ': 'Can I work and present offline?',
  'site.docs.faq.offlineA':
    'Yes. You can edit and present offline in the desktop app using a {format} file with embedded content. If you only need to present, export a single {html} file that plays offline in a browser. Images and the player are included; desktop export can also embed subsets of installed fonts. Browser export depends on available fonts. Linked videos still need a network connection.',
  'site.docs.faq.networkQ': 'What does the app send over the network?',
  'site.docs.faq.networkA':
    'For update behavior and transmitted data, follow the README link below. To change update checks, open About CanvaSlide in the desktop app: clear Check for updates at launch to disable the launch check, or choose Check for updates to check now.',
  'site.docs.faq.networkLink': 'Network and privacy in the README',
  'site.docs.faq.autosaveQ': 'Where is my work saved?',
  'site.docs.faq.autosaveA':
    'You choose the file location when saving. When enabled and local storage is available, recovery periodically keeps a copy on this computer and can offer the last completed copy after a restart. Recent edits may be missing, and browser reloads can also show a recovery offer. Saving schedules cleanup of the recovery copy. There is no automatic cloud sync, so keep saving your document as you work.',
  'site.docs.faq.editQ': 'Can someone edit my exported presentation?',
  'site.docs.faq.editA':
    'The exported file is for presenting. To continue editing in the app, open the original canvas document. Keep both files when you need an editable source and a portable presentation.',
  'site.docs.faq.priceQ': 'Is it free?',
  'site.docs.faq.priceA':
    'Yes. The project is free and open source under the MIT license. You can inspect the code, contribute, and build the app yourself.',
  'site.docs.faq.helpQ': 'Where can I report a problem?',
  'site.docs.faq.helpA':
    'Open an issue in the official repository. Include your operating system, the steps to reproduce the problem, and a small example when possible. Remove private content before sharing a document.',

  // Official website.
  'site.nav.product': 'Product',
  'site.nav.showcase': 'ShowCase',
  'site.nav.docs': 'Docs',
  'site.nav.menu': 'Open navigation',
  'site.nav.close': 'Close navigation',
  'site.nav.label': 'Main navigation',
  'site.skip': 'Skip to content',
  'site.language': 'Language',
  'site.light': 'Switch to light theme',
  'site.dark': 'Switch to dark theme',
  'site.home': '{product} home',
  'site.ray.pause': 'Pause mascot animation',
  'site.ray.play': 'Resume mascot animation',
  'site.overview.title': 'See the whole story.\nKeep the thread.',
  'site.overview.description':
    'See how clients, services and data connect across a real system diagram. Choose a region to explain, then return to the whole canvas to keep the request flow in view.',
  'site.overview.hint':
    'Choose a region. Follow its connections. Return to the whole system whenever you need it.',
  'site.overview.all': 'Whole system',
  'site.overview.previous': 'Previous region',
  'site.overview.next': 'Next region',
  'site.overview.region':
    'System architecture overview. Select a region, use the arrow keys to continue, or press Escape to see the whole system.',
  'site.overview.open': 'View region {n}: {name}',
  'site.overview.caption':
    'Shop platform architecture: clients and edge, services, and data. Sample content in English.',
  'site.overview.edgeFrame': 'Clients and edge',
  'site.overview.servicesFrame': 'Services',
  'site.overview.dataFrame': 'Data',
  'site.overview.link': 'Present with the whole picture in mind',
  'site.docs.frames.overviewHeading': 'See every slide and keep the story moving',
  'site.docs.frames.overviewBody':
    'During a presentation, use the overview control to see all your slides together on the canvas. Click a frame to move directly to that moment, then continue with the previous and next controls. Return to the overview whenever you want to show how the parts connect. The overview and frame selection are also available in the exported browser presentation.',
  'site.hero.title': 'One canvas.\nEvery perspective.',
  'site.hero.description':
    'Build a zooming presentation on one infinite canvas. Connect ideas, move from the big picture into nested details, and export a single {html} file to present offline with embedded content.',
  'site.hero.try': 'Explore ShowCase',
  'site.hero.note': 'Free & open source. Desktop editing works offline.',
  'site.hero.scroll': 'A canvas full of possibilities',
  'site.hero.eyebrow': 'Free presentation software. Infinite canvas.',
  'site.hero.ray': 'Ray, the blue {product} mascot, gliding freely with outstretched wings.',
  'site.hero.file': 'Your story, ready to go.',
  'site.possibilities.eyebrow': 'MAKE ROOM FOR EVERY KIND OF IDEA',
  'site.possibilities.title': 'One canvas.\nSo many ways to say it.',
  'site.possibilities.description':
    'Map a process, connect a system, or take the stage. The same flexible canvas adapts to your story.',
  'site.possibilities.label': 'Example canvases',
  'site.possibilities.flowchart': 'Flowcharts',
  'site.possibilities.flowchartTitle': 'Make the next step clear.',
  'site.possibilities.flowchartBody':
    'Turn a process into a visual path. Connect steps, branch at decisions, and walk through every outcome with presentation frames.',
  'site.possibilities.flowchartAlt':
    'An order fulfillment flowchart with decision branches and three presentation frames.',
  'site.possibilities.erd': 'ER diagrams',
  'site.possibilities.erdTitle': 'See how it all connects.',
  'site.possibilities.erdBody':
    'Draw tables, label relationships, and tell the story of your data. Present the whole schema, then zoom into a single group of tables.',
  'site.possibilities.erdAlt':
    'An online shop ER diagram with seven tables, relationship connectors, and nested presentation frames.',
  'site.possibilities.slides': 'Presentation slides',
  'site.possibilities.slidesTitle': 'Give your slides more space.',
  'site.possibilities.slidesBody':
    'Create familiar, {style}-style slides with text, images, charts made from shapes, and diagrams. Arrange them together on one canvas and choose the path between them.',
  'site.possibilities.slidesAlt':
    'Six presentation slides on one canvas: title, agenda, problem, process, results, and roadmap.',
  'site.possibilities.more': 'And mind maps, architecture diagrams, visual plans…',
  'site.possibilities.open': 'Open the live example',
  'site.possibilities.download': 'Download {format}',
  'site.possibilities.caption': 'Made in {product} · Example content in English',
  'site.share.download': 'Try a real {format} export',
  'site.share.browser': 'A browser is all they need',
  'site.share.offline': 'Plays without a connection',
  'site.share.motion': 'Zoom transitions come along',
  'site.zoom.eyebrow': 'A CLOSER LOOK, WITHOUT CHANGING SLIDES',
  'site.zoom.title': 'Same slide.\nA new point of view.',
  'site.zoom.description':
    'Start with the whole picture. Place a smaller frame around a chart, a table, or one important detail. Zoom in to explain it, then pull back to reconnect the story.',
  'site.zoom.whole': 'Whole slide',
  'site.zoom.chart': 'Inside the chart',
  'site.zoom.detail': 'One detail',
  'site.zoom.label':
    'Interactive slide zoom. Use left and right arrow keys to change the view, or Escape to see the whole slide.',
  'site.zoom.caption': 'One slide. Three views. Try the controls.',
  'site.zoom.image':
    'Sample slide with a chart of weekly adoption, rising from 18 percent to 91 percent.',
  'site.zoom.note': 'Sample presentation data',
  'site.zoom.link': 'Learn to frame the details',
  'site.docs.frames.detailHeading': 'Zoom into part of the same slide',
  'site.docs.frames.detailBody':
    'Create a frame for the whole slide, then use the frame tool to draw a smaller frame around a chart, table, or other detail inside it. Place the detail frame after the full-slide frame in the frame list. Presenting moves the camera into that area; the previous-frame control takes you back to the full slide. Both views use the same canvas content, so there is no need to duplicate the slide. These frame transitions also work in an {format} export.',
  'site.demo.document': 'Example · {name}',
  'site.demo.label':
    'Nested presentation frames. Use arrow keys to zoom between the canvas, results slide and its detail. Escape returns to the overview.',
  'site.demo.all': 'Overview',
  'site.demo.idea': 'The canvas',
  'site.demo.frame': 'Results',
  'site.demo.story': 'The detail',
  'site.demo.play': 'Play the story',
  'site.demo.stop': 'Pause',
  'site.demo.previous': 'Previous frame',
  'site.demo.next': 'Next frame',
  'site.demo.hint': 'One canvas. Follow the frames into the detail.',
  'site.demo.scene': 'Frame {n} of {total}',
  'site.story.title': 'A little space.\nA whole new way to present.',
  'site.story.description':
    'Start with the whole story, enter a frame, then zoom into the detail inside it.',
  'site.story.step1Title': 'See the whole canvas.',
  'site.story.step1Body':
    'Every slide lives in the same space. This is a real example you can open and edit.',
  'site.story.step2Title': 'Move into the results.',
  'site.story.step2Body':
    'The camera approaches the results frame. The surrounding slides stay in place as the numbers come into view.',
  'site.story.step3Title': 'Go deeper, without a cut.',
  'site.story.step3Body':
    'A smaller frame sits inside the results slide. Zoom into it and keep the connection between the detail and the whole.',
  'site.story.controls': 'Story chapters',
  'site.features.previewAlt':
    '{name} presentation moving from anatomical details to the whole human body through frames {first}–{last}.',
  'site.features.previewCaption': '{name} · Frames {first}–{last}',
  'site.features.previewPlay': 'Replay preview',
  'site.features.previewStop': 'Stop preview',
  'site.features.previewOpen': 'Open example',
  'site.features.title': 'Everything your\nnext idea needs.',
  'site.features.description':
    'Thoughtful tools. A clear canvas. Less between you and what you want to say.',
  'site.features.canvasTitle': 'Think in every direction.',
  'site.features.canvasBody':
    'Pan, zoom, and make connections with text, shapes, images, and connectors. Your canvas grows with your ideas.',
  'site.features.controlTitle': 'A familiar feeling.',
  'site.features.controlBody':
    'Align, duplicate, undo. The shortcuts you already know, with the precision your ideas deserve.',
  'site.features.offlineTitle': 'Create and present offline.',
  'site.features.offlineBody':
    'Save your canvas on your computer. The desktop app edits and presents embedded content without an account or an internet connection.',
  'site.share.title': 'Your whole story.\nOne {format} file.',
  'site.share.body':
    'Your canvas, embedded images, presentation frames, and zoom transitions travel together in one {format} file. Open it in a browser without installing the app. Embedded content works offline; linked videos need their provider and network.',
  'site.share.link': 'Learn to export an offline presentation',
  'site.share.source': 'Your editable canvas',
  'site.share.export': 'Ready to present',
  'site.share.note': 'Images and the player, all included.',
  'site.download.title': 'Your next idea\nstarts here.',
  'site.download.body': 'A little canvas. A lot of possibilities.',
  'site.download.releases': 'View releases',
  'site.download.macDetail': '{version} or later',
  'site.download.windowsDetail': 'Desktop application',
  'site.download.pending':
    'Installers for both desktop platforms are available on the Releases page. Choose the file for your device.',
  'site.download.guide': 'Installation guide',
  'site.download.source': 'Build from source',
  'site.footer.tagline': 'Your ideas. Room to fly.',
  'site.footer.license': 'Free, open source, and made to explore.',
  'site.footer.issues': 'Feedback & issues',
  'site.footer.licenseLink': 'License',
  'site.footer.thirdPartyNotices': 'Third-party notices',
  'site.footer.top': 'Back to top',
  'site.meta.home': '{product} — Free Presentation Software with Canvas Zoom',
  'site.meta.description':
    'Free, open-source presentation software for {mac}, {windows} and the web. Zoom into nested frames, import {design} and {pdf}, and export {html} for offline playback.',
  'site.screenshot.editor': 'The canvas editor with shapes, text, and presentation frames',
  'site.screenshot.present': 'A presentation frame in full-screen view'
} as const
