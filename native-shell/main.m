#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <arpa/inet.h>
#import <netinet/in.h>
#import <sys/socket.h>
#import <unistd.h>

static NSString * const AppBundleIdentifier = @"io.hagibis.dashboard";
static NSString * const AppExecutableName = @"HagibisDashboard";

static NSURL *BundleResourcesURL(void) {
    return NSBundle.mainBundle.resourceURL;
}

static NSURL *BundledServerURL(void) {
    return [BundleResourcesURL() URLByAppendingPathComponent:@"server.js"];
}

static NSURL *BundledRuntimeConfigURL(void) {
    return [BundleResourcesURL() URLByAppendingPathComponent:@"runtime-config.plist"];
}

static NSString *BundledNodePath(void) {
    NSURL *resourcesURL = BundleResourcesURL();
    NSArray<NSString *> *candidates = @[
        @"node-runtime/bin/node",
        @"bin/node",
    ];

    for (NSString *relativePath in candidates) {
        NSURL *candidateURL = [resourcesURL URLByAppendingPathComponent:relativePath];
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:candidateURL.path]) {
            return candidateURL.path;
        }
    }

    return nil;
}

static NSString *PreferredSystemNodePath(void) {
    NSArray<NSString *> *candidates = @[
        @"/opt/homebrew/bin/node",
        @"/usr/local/bin/node",
        @"/usr/bin/node",
    ];

    for (NSString *candidate in candidates) {
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:candidate]) {
            return candidate;
        }
    }

    return nil;
}

static NSString *DefaultEnvFilePath(void) {
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSURL *bundleURL = NSBundle.mainBundle.bundleURL;
    NSMutableArray<NSString *> *candidates = [NSMutableArray array];

    NSURL *bundleParentURL = [bundleURL URLByDeletingLastPathComponent];
    NSURL *projectRootURL = [bundleParentURL URLByDeletingLastPathComponent];

    [candidates addObject:[[bundleParentURL URLByAppendingPathComponent:@".env.local"] path]];
    [candidates addObject:[[projectRootURL URLByAppendingPathComponent:@".env.local"] path]];
    [candidates addObject:[[fileManager.currentDirectoryPath stringByStandardizingPath] stringByAppendingPathComponent:@".env.local"]];

    for (NSString *candidate in candidates) {
        if (candidate.length > 0 && [fileManager fileExistsAtPath:candidate]) {
            return candidate;
        }
    }

    return nil;
}

static NSInteger FindOpenPort(void) {
    int socketFD = socket(AF_INET, SOCK_STREAM, 0);
    if (socketFD < 0) return 4184;

    int reuse = 1;
    setsockopt(socketFD, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    struct sockaddr_in address;
    memset(&address, 0, sizeof(address));
    address.sin_len = sizeof(address);
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = 0;

    if (bind(socketFD, (struct sockaddr *)&address, sizeof(address)) != 0) {
        close(socketFD);
        return 4184;
    }

    socklen_t length = sizeof(address);
    if (getsockname(socketFD, (struct sockaddr *)&address, &length) != 0) {
        close(socketFD);
        return 4184;
    }

    NSInteger port = ntohs(address.sin_port);
    close(socketFD);
    return port > 0 ? port : 4184;
}

static NSScreen *PreferredDashboardScreen(void) {
    NSArray<NSScreen *> *screens = NSScreen.screens ?: @[];
    if (screens.count == 0) return NSScreen.mainScreen;
    if (screens.count == 1) return screens.firstObject;

    NSScreen *mainScreen = NSScreen.mainScreen;
    NSScreen *bestExternal = nil;

    for (NSScreen *screen in screens) {
        if (screen == mainScreen) continue;
        if (!bestExternal) {
            bestExternal = screen;
            continue;
        }

        NSRect current = screen.frame;
        NSRect best = bestExternal.frame;
        CGFloat currentArea = current.size.width * current.size.height;
        CGFloat bestArea = best.size.width * best.size.height;
        if (currentArea < bestArea) {
            bestExternal = screen;
        }
    }

    return bestExternal ?: mainScreen ?: screens.firstObject;
}

static NSString *EscapeHTML(NSString *input) {
    NSString *escaped = [input stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
    return escaped;
}

@interface DragHandleView : NSView
@property (nonatomic, copy) void (^doubleClickHandler)(void);
@end

@implementation DragHandleView

- (BOOL)isOpaque {
    return NO;
}

- (void)drawRect:(NSRect)dirtyRect {
    (void)dirtyRect;

    NSRect ledgeRect = NSMakeRect(floor((NSWidth(self.bounds) - 42.0) / 2.0), 8.0, 42.0, 4.0);
    [[NSColor colorWithWhite:1.0 alpha:0.18] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:ledgeRect xRadius:2.0 yRadius:2.0] fill];
}

- (void)mouseDown:(NSEvent *)event {
    if (event.clickCount >= 2) {
        if (self.doubleClickHandler) self.doubleClickHandler();
        return;
    }

    [self.window performWindowDragWithEvent:event];
}

@end

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate>
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSTask *serverTask;
@property (nonatomic, strong) NSTimer *pollTimer;
@property (nonatomic, strong) NSURL *dashboardURL;
@property (nonatomic, assign) NSInteger port;
@property (nonatomic, assign) NSTimeInterval startupDeadline;
@property (nonatomic, strong) id eventMonitor;
@property (nonatomic, assign) NSRect restoredFrame;
@property (nonatomic, assign) BOOL fillsScreen;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;

    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [self applyPresentationMode];
    [self installEscapeToQuitMonitor];
    [self createWindow];
    [self startServer];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    (void)sender;
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    (void)notification;
    if (self.eventMonitor) {
        [NSEvent removeMonitor:self.eventMonitor];
        self.eventMonitor = nil;
    }
    [self.pollTimer invalidate];
    self.pollTimer = nil;
    [NSApp setPresentationOptions:NSApplicationPresentationDefault];
    [self stopServer];
}

- (void)installEscapeToQuitMonitor {
    __weak typeof(self) weakSelf = self;
    self.eventMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent * _Nullable(NSEvent * _Nonnull event) {
        if (event.keyCode == 53) {
            [weakSelf stopServer];
            [NSApp terminate:nil];
            return nil;
        }
        return event;
    }];
}

- (void)createWindow {
    NSScreen *screen = PreferredDashboardScreen();
    NSRect frame = [self defaultRestoredFrameForScreen:screen];

    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:NSWindowStyleMaskBorderless
                                                backing:NSBackingStoreBuffered
                                                  defer:NO
                                                 screen:screen];
    self.window.title = @"Hagibis Dashboard";
    self.window.backgroundColor = NSColor.blackColor;
    self.window.collectionBehavior = NSWindowCollectionBehaviorFullScreenPrimary | NSWindowCollectionBehaviorCanJoinAllSpaces;
    self.fillsScreen = NO;
    self.restoredFrame = frame;

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;

    self.webView = [[WKWebView alloc] initWithFrame:frame configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.allowsMagnification = NO;

    NSView *contentView = [[NSView alloc] initWithFrame:frame];
    contentView.wantsLayer = YES;
    contentView.layer.backgroundColor = NSColor.blackColor.CGColor;

    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    [contentView addSubview:self.webView];
    [NSLayoutConstraint activateConstraints:@[
        [self.webView.leadingAnchor constraintEqualToAnchor:contentView.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:contentView.trailingAnchor],
        [self.webView.topAnchor constraintEqualToAnchor:contentView.topAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:contentView.bottomAnchor],
    ]];

    DragHandleView *dragHandle = [[DragHandleView alloc] initWithFrame:NSZeroRect];
    dragHandle.translatesAutoresizingMaskIntoConstraints = NO;
    dragHandle.wantsLayer = YES;
    dragHandle.layer.backgroundColor = NSColor.clearColor.CGColor;
    __weak typeof(self) weakSelf = self;
    dragHandle.doubleClickHandler = ^{
        [weakSelf toggleWindowFill];
    };
    [contentView addSubview:dragHandle];
    [NSLayoutConstraint activateConstraints:@[
        [dragHandle.topAnchor constraintEqualToAnchor:contentView.topAnchor],
        [dragHandle.leadingAnchor constraintEqualToAnchor:contentView.leadingAnchor],
        [dragHandle.trailingAnchor constraintEqualToAnchor:contentView.trailingAnchor],
        [dragHandle.heightAnchor constraintEqualToConstant:20.0],
    ]];

    self.window.contentView = contentView;
    [self.window makeKeyAndOrderFront:nil];
}

- (NSRect)defaultRestoredFrameForScreen:(NSScreen *)screen {
    NSRect available = screen ? screen.visibleFrame : NSMakeRect(0, 0, 800, 600);
    CGFloat width = MAX(320.0, floor(available.size.width * 0.88));
    CGFloat height = MAX(240.0, floor(available.size.height * 0.88));
    CGFloat originX = floor(NSMidX(available) - width / 2.0);
    CGFloat originY = floor(NSMidY(available) - height / 2.0);
    return NSMakeRect(originX, originY, width, height);
}

- (void)applyPresentationMode {
    NSApplicationPresentationOptions options = self.fillsScreen
        ? (NSApplicationPresentationHideDock |
           NSApplicationPresentationHideMenuBar)
        : NSApplicationPresentationDefault;
    [NSApp setPresentationOptions:options];
}

- (void)toggleWindowFill {
    NSScreen *screen = self.window.screen ?: PreferredDashboardScreen();
    if (self.fillsScreen) {
        NSRect target = NSEqualRects(self.restoredFrame, NSZeroRect) ? [self defaultRestoredFrameForScreen:screen] : self.restoredFrame;
        [self.window setFrame:target display:YES animate:YES];
        self.fillsScreen = NO;
        [self applyPresentationMode];
        return;
    }

    self.restoredFrame = self.window.frame;
    NSRect target = screen ? screen.frame : self.window.frame;
    [self.window setFrame:target display:YES animate:YES];
    self.fillsScreen = YES;
    [self applyPresentationMode];
}

- (void)startServer {
    NSURL *serverURL = BundledServerURL();
    NSString *nodePath = BundledNodePath() ?: PreferredSystemNodePath();
    if (!nodePath || ![[NSFileManager defaultManager] fileExistsAtPath:serverURL.path]) {
        NSString *message = !nodePath ? @"Node runtime not found." : @"server.js is missing from the app bundle.";
        [self loadFailurePageWithTitle:@"Launch failed" message:message detail:@"The native shell could not start the bundled dashboard server."];
        return;
    }

    self.port = FindOpenPort();
    self.dashboardURL = [NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%ld/", (long)self.port]];

    NSMutableDictionary<NSString *, NSString *> *environment = [NSMutableDictionary dictionaryWithDictionary:NSProcessInfo.processInfo.environment];
    environment[@"PORT"] = [NSString stringWithFormat:@"%ld", (long)self.port];
    environment[@"NODE_ENV"] = @"production";

    NSDictionary *runtimeConfig = [NSDictionary dictionaryWithContentsOfURL:BundledRuntimeConfigURL()];
    NSString *envFile = [runtimeConfig[@"EnvFile"] isKindOfClass:NSString.class] ? runtimeConfig[@"EnvFile"] : nil;
    if (envFile.length == 0) {
        envFile = DefaultEnvFilePath();
    }
    if (envFile.length > 0 && [[NSFileManager defaultManager] fileExistsAtPath:envFile]) {
        environment[@"HAGIBIS_ENV_FILE"] = envFile;
    }

    self.serverTask = [[NSTask alloc] init];
    self.serverTask.launchPath = nodePath;
    self.serverTask.arguments = @[serverURL.path];
    self.serverTask.currentDirectoryPath = BundleResourcesURL().path;
    self.serverTask.environment = environment;

    NSPipe *outputPipe = [NSPipe pipe];
    self.serverTask.standardOutput = outputPipe;
    self.serverTask.standardError = outputPipe;

    NSFileHandle *readHandle = outputPipe.fileHandleForReading;
    readHandle.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length == 0) return;
        NSString *message = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        if (message.length > 0) {
            NSLog(@"%@", message);
        }
    };

    __weak typeof(self) weakSelf = self;
    self.serverTask.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            weakSelf.serverTask = nil;
            [weakSelf.pollTimer invalidate];
            weakSelf.pollTimer = nil;
            if (!weakSelf.webView.URL) {
                NSString *detail = [NSString stringWithFormat:@"Server exited with status %d.", task.terminationStatus];
                [weakSelf loadFailurePageWithTitle:@"Dashboard server stopped" message:detail detail:@"Check whether the external API keys are still present in the configured .env.local file."];
            }
        });
    };

    @try {
        [self.serverTask launch];
    } @catch (NSException *exception) {
        [self loadFailurePageWithTitle:@"Launch failed"
                               message:@"The bundled server process could not start."
                                detail:exception.reason ?: @"Unknown launch error."];
        return;
    }

    self.startupDeadline = NSDate.date.timeIntervalSince1970 + 30.0;
    [self beginPollingServer];
}

- (void)beginPollingServer {
    [self.pollTimer invalidate];
    self.pollTimer = [NSTimer scheduledTimerWithTimeInterval:0.5
                                                      target:self
                                                    selector:@selector(checkServerReady)
                                                    userInfo:nil
                                                     repeats:YES];
    [self.pollTimer fire];
}

- (void)checkServerReady {
    if (!self.dashboardURL) return;

    NSURL *healthURL = [NSURL URLWithString:@"api/health" relativeToURL:self.dashboardURL];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:healthURL];
    request.timeoutInterval = 1.0;
    request.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;

    __weak typeof(self) weakSelf = self;
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        (void)data;
        if (!error && [response isKindOfClass:NSHTTPURLResponse.class] && ((NSHTTPURLResponse *)response).statusCode == 200) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [weakSelf.pollTimer invalidate];
                weakSelf.pollTimer = nil;
                if (!weakSelf.webView.URL) {
                    [weakSelf.webView loadRequest:[NSURLRequest requestWithURL:weakSelf.dashboardURL]];
                }
            });
            return;
        }

        if (NSDate.date.timeIntervalSince1970 > weakSelf.startupDeadline) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [weakSelf.pollTimer invalidate];
                weakSelf.pollTimer = nil;
                NSString *detail = error.localizedDescription ?: @"The local health endpoint never became ready.";
                [weakSelf loadFailurePageWithTitle:@"Server timeout"
                                           message:@"The dashboard did not become ready within 30 seconds."
                                            detail:detail];
            });
        }
    }] resume];
}

- (void)stopServer {
    if (!self.serverTask) return;

    if (self.serverTask.running) {
        [self.serverTask interrupt];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (self.serverTask.running) {
                [self.serverTask terminate];
            }
        });
    }
}

- (void)loadFailurePageWithTitle:(NSString *)title message:(NSString *)message detail:(NSString *)detail {
    NSString *html = [NSString stringWithFormat:
                      @"<!doctype html><html><head><meta charset='utf-8'><style>"
                      "html,body{margin:0;padding:0;background:#111;color:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,sans-serif;height:100%%;}"
                      "body{display:flex;align-items:center;justify-content:center;}"
                      ".card{max-width:720px;padding:32px;border:1px solid #444;border-radius:20px;background:#171717;}"
                      "h1{margin:0 0 12px;font-size:28px;}p{margin:0 0 10px;font-size:16px;line-height:1.5;color:#d0d0d0;}code{color:#fff;}"
                      "</style></head><body><div class='card'><h1>%@</h1><p>%@</p><p>%@</p></div></body></html>",
                      EscapeHTML(title ?: @"Error"),
                      EscapeHTML(message ?: @"Unknown error"),
                      EscapeHTML(detail ?: @"")];
    [self.webView loadHTMLString:html baseURL:nil];
}

@end

int main(int argc, const char * argv[]) {
    (void)argc;
    (void)argv;

    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        app.activationPolicy = NSApplicationActivationPolicyRegular;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        return NSApplicationMain(argc, argv);
    }
}
