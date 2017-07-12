function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

var previewTemplate = kendo.template(
"<ul class='docs-tabstrip' >" +
  "<li class='active'><a href='\\#preview-#= index #' data-toggle='tab'>Example</a></li>" +
  "<li><a href='\\#code-#= index #' data-toggle='tab'>View Source</a></li>" +
  "<li class='editor-container'>" +
  "#= editButtonTemplate #" +
  "</li>" +
"</ul>" +
"<div class='tab-content'>" +
  "<div class='tab-pane active tab-preview' id='preview-#= index #'></div>" +
  "<div class='tab-pane tab-code' id='code-#= index #'></div>" +
"</div>");

var fileListTemplate = kendo.template(
    "<div class='file-list'>" +
        "<ul class='docs-tabstrip'>" +
            "# for (var i = 0; i < files.length; i++) { #" +
                "#var filename = files[i].getAttribute('data-file')#" +
                "#if(i === 0){# <li class='active'> #}else{# <li> #}#" +
                    "<a href='\\#filename#=i#-#=index#' data-toggle='tab'>#=filename#</a>" +
                "</li>" +
            "# } #" +
        "</ul>" +
        "<div class='tab-content'></div>" +
    "</div>"
);

var editorTemplate = kendo.template(
  "<div class='dialog-overlay'>" +
    "<div class='editor dialog dialog-enter'>" +
      "<h3>Sandbox</h3>" +
      "<button class='button-close'><span>X</span></button>" +
      "<div class='editor-container'>" +
      "#= editButtonTemplate #" +
      "</div>" +
      "<div class='edit-area clearfix'>" +
      "<div class='col-xs-6 col-md-6 col-lg-6'>" +
        "# for (var i = 0; i < block.types.length; i++) { #" +
          "<div class='pane pane-#: block.types[i].language #' data-code-language='#: block.types[i].label #' />" +
        "# } #" +
      "</div>" +
      "<div class='col-xs-6 col-md-6 col-lg-6'>" +
        "<div class='pane-preview' data-code-language='Preview' />" +
      "</div>" +
      "</div>" +
    "</div>" +
  "</div>"
);

var errorTemplate = kendo.template("<pre style=\"position:absolute;bottom:0;color:red\">#: error #</pre>")

var reactTemplate = kendo.template(
"<!DOCTYPE html>" +
"<html>" +
  "<head>" +
    "#= cdn #" +
    "<script>" +
    "window.onload = _runnerInit;" +
    "window.onerror = function(e) {" +
        "document.write('<pre style=\"position:absolute;bottom:0;color:red\">' + e + '</pre>');" +
    "};</script>" +
  "</head>" +
  "<body style=\"margin: 0; font-family: 'RobotoRegular', Helvetica, Arial, sans-serif; font-size: 14px;\">" +
    "#= content #" +
    "<script>console.log(window);" +
      "#= script #" +
    "</script>" +
  "</body>" +
"</html>");

var CDN = ['https://fb.me/react-0.14.7.min.js', 'https://fb.me/react-dom-0.14.7.min.js'];

function SnippetRunner(container) {
    this.container = container;
    this.iframe = $();
}

SnippetRunner.prototype = {
    resizeFrame: function() {
      var RESIZE_THRESHOLD = 5;

      if ($(this.iframe).closest("[data-height]").length) {
        // height is set through {% meta %}
        return;
      }

      try {
        var iframe = this.iframe;
        var body = iframe.contents().find("body")[0];
      } catch(e) {
        // iframe may not be available
        return;
      }

      if (!iframe || !body) {
          return;
      }

      var height = body.offsetHeight;
      if (Math.abs(height - iframe.height()) > RESIZE_THRESHOLD) {
          iframe.height(height);
      }
    },

    call: function(name) {
      var iframe = this.iframe[0];
      var iframeWnd = iframe.contentWindow || iframe;
      var method = iframeWnd[name] || $.noop;

      method.apply(iframeWnd, Array.prototype.slice.call(arguments, 1));
    },

    _closestHeader: function(element) {
      return element.closest('article > *').prevAll('h1,h2,h3,h4,h5,h6').first();
    },

    _idFromText: function(text) {
      return $.trim(text.toLowerCase()).replace(/\s+/g, '-');
    },

    update: function(content) {
      this.container.empty();

      var attributes = { src: 'javascript:void(0)' };

      var metaContainer = $(this.container).closest("[data-height]");
      var height = metaContainer.attr("data-height") || 340;
      attributes.style = 'height:' + height + 'px';

      var id = metaContainer.attr("data-id") || this._idFromText(this._closestHeader(this.container).text());
      attributes.id = 'example-' + id;

      this.iframe =
          $('<iframe class="snippet-runner">')
              .attr(attributes)
              .show()
              .appendTo(this.container);

      metaContainer.height("");

      var contents = this.iframe.contents();
      contents[0].open();
      contents[0].write(content);
      contents[0].close();

      var iframe = this.iframe[0];
      var iframeWnd = iframe.contentWindow || iframe;
      iframeWnd._runnerInit = this.resizeFrame.bind(this);
    }
};

function resourceLinks(resources) {
    return $.map(resources, function(resource) {
        if (resource.match(/\.css$/)) {
            return "<link rel='stylesheet' href='" + resource + "'>";
        } else {
            return "<script src='" + resource + "'></script>";
        }
    }).join("");
}

// TODO: consider using systemJS for previewing react
function reactPage(html, jsx) {
    var transpiled;
    try {
        transpiled = Babel.transform(jsx, {
            presets: [ 'react', 'es2015', 'stage-1' ]
        }).code;
    } catch(e) {
        var message = e.message.replace(/\n/g, "\\n");
        console.warn(e.message);
        transpiled = "document.write('" + errorTemplate({ error: message }) + "')";
    }

    return reactTemplate({
        cdn: resourceLinks(
            CDN.concat([
                window.jsCDN,
                window.cssCDN
            ])
        ),
        content: html,
        script: transpiled
    });
}

var groupExtractor = /^\((.*?)\)$/g;
function extractRules(value) {
    var result = (value || "").match(groupExtractor);

    if (!result) {
        return value ? [value] : [];
    }

    return result
            .map(function(m) {
                var result = groupExtractor.exec(m);
                return result ? result[1] : "";
            });
};

function concatMatchers(current, additional) {
    var currentRules = extractRules(current);
    var additionalRules = extractRules(additional);

    return '(' + currentRules.concat(additionalRules).join('|') + ')';
}

function registerDirectives(moduleDirectives) {
    var directives = [];

    moduleDirectives.forEach(function(current) {
        var filtered = false;

        directives.forEach(function(uniqueDirective) {
            if (current.module === uniqueDirective.module) {
                uniqueDirective.import = uniqueDirective.import || current.import;

                if (current.match) {
                    uniqueDirective.match = concatMatchers(uniqueDirective.match, current.match);
                }

                filtered = true;
            }
        });

        if (!filtered) {
            directives.push(current);
        }
    });

    return directives;
}

var moduleDirectives = registerDirectives(window.moduleDirectives || []);

var htmlTemplate = kendo.template(
'<!doctype html>\
<html>\
<head>\
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0-alpha.6/css/bootstrap.min.css" integrity="sha384-rwoIResjU2yc3z8GV/NPeZWAv56rSmLldC3R/AZzGRnGxQQKnKkoFVhFQhNUwEyJ" crossorigin="anonymous">\
    <link rel="stylesheet" href="#: data.npmUrl #/@progress/kendo-theme-#: data.theme || "default" #/dist/all.css" />\
    <style>\
        html, body { overflow: hidden; }\
        body { font-family: "RobotoRegular",Helvetica,Arial,sans-serif; font-size: 14px; margin: 0; }\
    </style>\
</head>\
<body>\
    #= data.html #\
</body>\
</html>\
', { useWithBlock: false });

var angularTemplate = kendo.template(
'<!doctype html>\
<html>\
<head>\
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0-alpha.6/css/bootstrap.min.css" integrity="sha384-rwoIResjU2yc3z8GV/NPeZWAv56rSmLldC3R/AZzGRnGxQQKnKkoFVhFQhNUwEyJ" crossorigin="anonymous">\
    <link rel="stylesheet" href="#: data.npmUrl #/@progress/kendo-theme-#: data.theme || "default" #/dist/all.css" />\
    <style>\
        html, body { overflow: hidden; }\
        body { font-family: "RobotoRegular",Helvetica,Arial,sans-serif; font-size: 14px; margin: 0; }\
        my-app { display: block; width: 100%; overflow: hidden; min-height: 80px; box-sizing: border-box; padding: 30px; }\
        my-app > .k-icon.k-i-loading { font-size: 64px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }\
        .example-wrapper { min-height: 280px; align-content: flex-start; }\
        .example-wrapper p, .example-col p { margin: 20px 0 10px; }\
        .example-wrapper p:first-child, .example-col p:first-child { margin-top: 0; }\
        .example-col { display: inline-block; vertical-align: top; padding-right: 20px; padding-bottom: 20px; }\
        .example-config { margin: 0 0 20px; padding: 20px; background-color: rgba(0,0,0,.03); border: 1px solid rgba(0,0,0,.08); }\
        .event-log { margin: 0; padding: 0; max-height: 100px; overflow-y: auto; list-style-type: none; border: 1px solid rgba(0,0,0,.08); background-color: \\#fff; }\
        .event-log li {margin: 0; padding: .3em; line-height: 1.2em; border-bottom: 1px solid rgba(0,0,0,.08); }\
        .event-log li:last-child { margin-bottom: -1px;}\
    </style>\
    <script src="https://unpkg.com/core-js/client/shim.min.js"></script>\
    <script src="https://unpkg.com/zone.js@0.8.11/dist/zone.js"></script>\
    <script src="https://unpkg.com/reflect-metadata@0.1.3/Reflect.js"></script>\
    <script src="https://unpkg.com/systemjs@0.19.27/dist/system.js"></script>\
    <script src="#: data.exampleRunner #"></script>\
    <script>\
        var runner = new ExampleRunner();\
        runner.configure(System, "#: data.npmUrl #", ' + JSON.stringify(moduleDirectives) + ', #= data.track #);\
        # for (var i = 0; i < data.files.length; i++) { #\
        runner.register("#= data.files[i].name #", "#= data.files[i].content #");\
        # } #\
        runner.start(System);\
    </script>\
</head>\
<body>\
    #= data.html #\
    <my-app>\
        <span class="k-icon k-i-loading" style="color: #: data.themeAccent || "\\#ff6358" #"></span>\
    </my-app>\
</body>\
</html>\
', { useWithBlock: false });

function wrapAngularTemplate(template) {
    if (!/^\s*</.test(template)) {
        // not a template
        return template;
    }
    // template-only code, wrap in component
    return [
        "@Component({",
        "    selector: 'my-app',",
        "    template: `" + template + "`",
        "})",
        "class AppComponent {}"
    ].join("\n");
}

var directivesByModule = [
    { module: '@angular/core', match: '@(Component)', import: "Component" },
    { module: '@angular/forms', match: 'ngModel', import: "FormsModule" },
    { module: '@angular/http', match: 'Http', import: "HttpModule" },
    { module: '@angular/platform-browser', match: '.', import: "BrowserModule" },
    { module: '@angular/platform-browser/animations', match: '.', import: "BrowserAnimationsModule" }
].concat(moduleDirectives);

// replaces code characters to allow embedding in a js double-quote string ("")
function codeToString(code) {
    return code.replace(/"/g, '\\"') // escape nested quotes
               .replace(/\n/g, '\\n'); // escape line endings
}

function getFullContent(listing) {
    if (listing['ts-multiple']) {
        var fullContent = "";
        listing['ts-multiple'].forEach(function(file) {
            fullContent = fullContent.concat(file.content);
        });

        return fullContent;
    }

    return listing['ts'];
}

function usedDirectives(code) {
    return directivesByModule.filter(function(directive) {
        return (new RegExp(directive.match)).test(code);
    }).filter(Boolean);
}

function plunkrDirectives(code) {
    var directives = usedDirectives(code);

    return directives.filter(function(item) {
        if (/Module$/.test(item.import)) {
            return true;
        }
    });
}

function analyzeDirectives(code) {
    var directives = usedDirectives(code);

    return directives.map(function(directive) {
        return {
            directive: directive.import,
            module: directive.module
        };
    });
}

function missingImports(code, directives) {
    var imports = [];

    directives.forEach(function(directive) {
        // test if directive is imported
        var imported = new RegExp("^\\s*import .* from\\s+[\"']" + directive.module + "[\"'];");

        if (!imported.test(code)) {
            imports.push(
                "import { " + directive.directive + " } from '" + directive.module + "';"
            );
        }
    });

    return imports;
}

function jsTrackingCode() {
    return [
        "import * as Raven from 'raven-js';",
        "import { ErrorHandler } from '@angular/core';",
        "Raven.config('https://e7cc5054385e4b4cb97bd7ea376c6174@sentry.io/112659').install();",
        "class RavenErrorHandler implements ErrorHandler {",
            "handleError(err:any) : void {",
                "Raven.captureException(err.originalError || err);",
            "}",
        "}"
    ].join("\n");
}

function bootstrapAngular(options) {
    var code = wrapAngularTemplate(options.code);
    var jsTracking = jsTrackingCode();

    var directives = analyzeDirectives(code);
    var imports = missingImports(code, directives);
    var moduleImports = directives.map(function(item) {
        if (/Module$/.test(item.directive)) {
            return item.directive;
        }
    }).filter(Boolean).join(',');

    return (imports.concat([
        code,
        "import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';",
        "import { NgModule, enableProdMode } from '@angular/core';",
        "import 'hammerjs';",
        options.track ? jsTracking : "",
        "@NgModule({",
            "declarations: [AppComponent],",
            "imports: [ " + moduleImports + " ],",
            options.track ? "providers: [ { provide: ErrorHandler, useClass: RavenErrorHandler } ]," : "",
            "bootstrap: [AppComponent]",
        "})",
        "class AppModule {}",
        window.location.hostname === "localhost" ? "" : "enableProdMode();",
        "platformBrowserDynamic().bootstrapModule(AppModule)",
        (options.resize ? "\t.then(_runnerInit)" : ""),
        "\t.catch(err => console.error(err));"
    ]).filter(Boolean).join("\n"));
}

function angularPage(opts) {
    var options = $.extend({
        npmUrl: window.npmUrl,
        exampleRunner: window.runnerScript,
        theme: 'default',
        themeAccent: themeColors.default,
        html: '',
        track: false
    }, opts);

    if (!options.ts) {
        return htmlTemplate(options);
    }

    var ts = codeToString(bootstrapAngular({
      code: options.ts,
      resize: true,
      track: options.track
    }));

    options.files = [
        { name: "main.ts", content: ts }
    ];

    return angularTemplate(options);
}

// types of code snippets
var blockTypes = {
    'generic': {
        // snippet without type
        // consider changing it by adding type in docs via ```some-type
        label: 'Generic listing, set code type in docs!',
        highlight: 'htmlmixed'
    },
    'cs': {
        label: 'C#',
        highlight: 'text/x-csharp'
    },
    'html': {
        label: 'HTML',
        highlight: 'htmlmixed'
    },
    'java': {
        label: 'Java',
        highlight: 'text/x-java'
    },
    'json': {
        label: 'JSON',
        highlight: 'application/json'
    },
    'jsx': {
        label: 'JSX',
        highlight: 'jsx'
    },
    'php': {
        label: 'PHP',
        highlight: 'php'
    },
    'sh': {
        label: 'Shell',
        highlight: 'bash',
        noRun: true
    },
    'js': {
        label: 'JavaScript',
        highlight: 'javascript',
        noRun: true
    },
    'scss': {
        label: 'SCSS',
        highlight: 'css',
        noRun: true
    },
    'ng-template': {
        label: 'Angular template',
        highlight: 'htmlmixed'
    },
    'ts': {
        label: 'TypeScript',
        highlight: 'text/typescript'
    },
    'xml': {
        label: 'XML',
        highlight: 'application/xml'
    }
};

// denotes group of several code snippets
function CodeListing(elements) {
  var that = this;

  this.elements = elements;

  this.types = $.map(this.elements.find("code"), function(element) {
      var preview = false;
      var noRun = false;
      var multiple = false;
      var language = /lang(uage)?-([^\s]+)/.exec(element.className);
      var hideTabs = element.className.match(/hide-tabs/);
      language = language ? language[2] : "generic";

      if (/-preview/.test(language)) {
          language = language.replace(/-preview/, "");
          preview = true;
      } else if (/-no-run/.test(language)) {
          language = language.replace(/-no-run/, "");
          noRun = true;
      }

      if (/-multiple/.test(language)) {
          language = language.replace(/-multiple/, "");
          multiple = true;
      }

      if (multiple) {
          var elems = that[language + "-multiple"] || [];

          elems.push({
              name: $(element).parent().attr("data-file"),
              content: $(element).text()
          });

          that[language + "-multiple"] = elems;
      }

      that[language] = $(element).text();

      return $.extend({
          language: language,
          noRun: noRun,
          multiple: multiple,
          hideTabs: hideTabs,
          preview: preview
      }, blockTypes[language]);
  });
}

CodeListing.prototype = {
    updateHtml: function() {
      var block = this;

      this.elements.find("code").addClass("cm-s-default")
        .each(function(idx) {
            var code = $(this);
            var typeInfo = block.types[idx];

            if (typeInfo.preview) {
                block.preview = true;
            } else if (typeInfo.noRun) {
                block.noRun = true;
            }

            if(typeInfo.multiple) {
                block.multiple = true;
            }

            code.parent().attr("data-code-language", typeInfo.label);

            // colorize code
            CodeMirror.runMode(code.text(), typeInfo.highlight, code[0]);
        });
    },
    hide: function() {
      this.elements.hide();
    },
    show: function() {
      this.elements.show();
    }
};

// TODO: extract form posting logic
var jsFiddleTemplate = '<form style="display: none;" action="http://jsfiddle.net/api/post/library/pure/" method="post" target="_blank">' +
'<input type="hidden" name="panel_html" value="0" />' +
'<input type="hidden" name="panel_js" value="3" />' + // 3 means babel
'<input type="hidden" name="wrap" value="b" />' +
'<input type="hidden" name="title" value="Kendo UI for React Example" />' +
'<input type="hidden" name="resources" value="" />' +
'<input type="hidden" name="html" value="" />' +
'<input type="hidden" name="js" value="" />' +
'<input type="hidden" name="css" value="" />' +
'</form>';

function openInFiddle(jsx, html) {
    var scripts = $.map(CDN.concat([window.jsCDN]), function(script) {
        return "<script src=" + script + "></script>\n";
    }).join("");

    var form = $(jsFiddleTemplate).appendTo(document.body);
    form.find('[name=html]').val("<!-- we need the resources here due to https://github.com/jsfiddle/jsfiddle-issues/issues/736 -->\n" + scripts + html);
    form.find('[name=js]').val(jsx);
    form.find('[name=css]').val("@import url('" + window.cssCDN + "');");
    form[0].submit();
    form.remove();
}

var basicPlunkerFiles = [
    'index.html'
];

var plunkerFiles = basicPlunkerFiles.concat([
    'app/main.ts',
    'app/app.component.ts',
    'app/app.module.ts',
]);

var systemJsDefaultKendoPackages = [
    { module: '@progress/kendo-data-query', main: 'dist/cdn/js/kendo-data-query.js' },
    { module: '@progress/kendo-drawing', main: 'dist/es/main.js' },
    { module: '@progress/kendo-file-saver', main: 'dist/npm/main.js' },
    { module: '@progress/kendo-angular-intl', main: 'dist/cdn/js/kendo-angular-intl.js' },
    { module: '@progress/kendo-angular-l10n', main: 'dist/cdn/js/kendo-angular-l10n.js' }
];

function getPlunkerFile(file) {
    return $.ajax(plunkerBluePrintPath + file, { dataType: 'text' });
}

var plunkerRequests; // global

function EditorForm(action) {
    this.form = $('<form style="display: none;" action="' + action + '" method="post" target="_blank" />').appendTo(document.body);
}

EditorForm.prototype.addField = function(name, value) {
    $('<input type=hidden />').val(value).attr("name", name).appendTo(this.form);
}

EditorForm.prototype.submit = function() {
    this.form[0].submit();
    this.form.remove();
    this.form = null;
}

function toModuleImport(dir) {
    return "import { " + dir.import + " } from '" + dir.module + "';";
}

function toSystemJsPackage(dir) {
    var key = '"' + dir.module + '"';
    var contents = JSON.stringify({ main: dir.main, defaultExtension: 'js' });

    return key + ": " + contents + ",";
}

function isUniquePackage(value, index, arr) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].module === value.module) {
            return i === index;
        }
    }
}

function prefixStyleUrls(content, prefix) {
  // prefix styleUrl paths with the given string
  return content.replace(
    /("|')([a-z0-9\.-]+\.css)\1/g,
    "$1" + prefix + "$2$1"
  );
}

function openInPlunkr(listing) {
    var ts = listing['ts'];
    var template = listing['ng-template'];
    var html = listing['html'];

    if (!ts) {
        ts = wrapAngularTemplate(template);
    }

    var directives = plunkrDirectives(getFullContent(listing));

    var plunkrContext = {
        appComponentContent: ts,
        npmUrl: $("<a />").attr("href", npmUrl)[0].href + "/",
        htmlContent: html,
        theme: "default",
        themeAccent: themeColors.default,

        appModuleImports:   $.map(directives, toModuleImport).join("\n"),
        appModules:         $.map(directives, function(dir) { return dir.import }).join(", "),
        systemjsPackages:   $.map(directives.filter(function(dir) { return dir.module.indexOf('@angular') != 0 })
                                            .concat(systemJsDefaultKendoPackages)
                                            .filter(isUniquePackage), toSystemJsPackage).join("\n" + Array(7).join(" "))
    };

    var form = new EditorForm('http://plnkr.co/edit/?p=preview');
    form.addField('tags[0]', 'angular2');
    form.addField('tags[1]', 'kendo');

    if (listing.multiple && listing['ts-multiple']) {
        $.each(listing['ts-multiple'], function(i, file) {
            var content = file.content;

            content = prefixStyleUrls(content, "app/");

            form.addField('files[app/' + file.name + ']', content);
        });
    }

    function ensureOrigin(url) {
        var prefix = (/^[a-z]:\/\//i).test(url) ? '' : window.location.origin;
        prefix += (/^\//).test(url) ? '' : '/';
        return prefix + url;
    }

    var config = new ExampleRunner().systemjsConfig(ensureOrigin(window.npmUrl), moduleDirectives);
    form.addField('files[systemjs.config.js]', 'System.config(' + JSON.stringify(config, null, 2) +');');

    $.when.apply($, plunkerRequests).then(function() {
        $.each(arguments, function(index, arr) {
            if (!listing.multiple || (listing.multiple && basicPlunkerFiles.indexOf(plunkerFiles[index]) >= 0)) {
                form.addField('files[' + plunkerFiles[index] + ']', kendo.template(arr[0])(plunkrContext));
            }
        })

        form.submit();
    });
}

var themeColors = {
  default: "#ff6358",
  bootstrap: "#0275d8"
};

$(function() {
  plunkerRequests = $.map(plunkerFiles, getPlunkerFile); // fetch the plunker templates

  var framework = {
      angular: {
          editor: 'plunkr',
          editButtonTemplate: '<a href="#" class="edit-online plunkr">Open as Plunker</a>',
          editOnline: function(listing) {
              openInPlunkr(listing);
              return false;
          },
          runnerContent: function(options) {
              var listing = options.listing;
              var theme = options.theme || 'default';

              return angularPage({
                  ts: listing['ts'] || listing['ng-template'],
                  html: listing['html'],
                  theme: theme,
                  themeAccent: themeColors[options.theme],
                  track: options.track
              });
          }
      },
      react: {
          editor: 'jsfiddle',
          editButtonTemplate: '<a href="#" class="edit-online jsfiddle">Edit in JSFiddle</a>',
          editOnline: function(listing) {
              openInFiddle(listing['jsx'], listing['html']);
              return false;
          },
          runnerContent: function(options) {
              var listing = options.listing;

              return reactPage(
                  listing['html'],
                  listing['jsx']
              );
          }
      }
  }[/\breact\b/i.test(window.jsCDN) ? 'react' : 'angular'];

  function toCodeListings(tags) {
      var blocks = [];

      for (var i = 0; i < tags.length;) {
          var tag = tags.eq(i);
          var siblingTags = tag.nextUntil(":not(pre)").addBack();
          if (tag.data("codeListing")) {
              // console.log('skip processing');
          } else {
              tag.data("codeListing", true);
              blocks.push(new CodeListing(siblingTags));
          }
          i += siblingTags.length;
      }

      return blocks;
  }

  toCodeListings($("pre")).forEach(function(block, idx) {
      var demoEmbed = $(block.elements).closest(".demo-embed");
      if (demoEmbed.length) {
        // fully-embedded demo, skip chrome rendering
        return;
      }

      block.updateHtml();

      if (block.multiple) {
          //list of files contained in the snippet
          var fileListElement = $(fileListTemplate({
              files: block.elements.not("[data-hidden]"),
              index: idx
          })).insertBefore(block.elements[0]);

          var elements = processMultiFileSourceBlocks(block.elements, idx);
          elements.appendTo(fileListElement.find('.tab-content'));
      }

      if (block.noRun) {
      } else if (block.preview) {
          // preview snippets - start with example, allow view source
          var previewElement = $(previewTemplate({
              editButtonTemplate: framework.editButtonTemplate,
              index: idx
          }));

          previewElement.insertBefore(block.multiple ? fileListElement : block.elements[0]);

          // preview snippets with multiple files should display the file list
          var codeTab = previewElement.find('.tab-code');
          codeTab.append(block.multiple ? fileListElement : block.elements);

          if (block.types[0].hideTabs) {
              $(previewElement[0]).hide(); // hide the tabstrip
          }

          previewElement.find('.edit-online').click(
              framework.editOnline.bind(null, block)
          );

          var content;
          if (block.multiple) {
              content = loadMultiFileRunnerContent(codeTab);
          } else {
              content = framework.runnerContent({
                  listing: block,
                  track: window.trackjs
              });
          }

          var preview = new SnippetRunner(previewElement.find('.tab-preview'))
          preview.update(content);
      } else {
          var title = $("<h5>Code Sample</h5>");
          title.insertBefore(block.multiple ? fileListElement : block.elements[0]);

          var run = $("<button class='button secondary'></button>");

          if (block.multiple) {
              run.text("Open as Plunker");
              run.insertAfter(fileListElement);
              run.click(framework.editOnline.bind(null, block));
          } else {
              run.text("Run Code");
              run.insertAfter(block.elements.last());
              run.wrap("<p class='run-code'></p>");

              // TODO: delegate run handler instead
              run.click(function() {
                $(document.body).css("overflow", "hidden")
                run.hide();
                title.hide();

                var editor = $(editorTemplate({
                    editButtonTemplate: framework.editButtonTemplate,
                    block: block
                })).insertAfter(block.elements[0]).show();

                var close = function() {
                $(document.body).css("overflow", "")
                run.show();
                title.show();
                editor.remove();
                }

                editor.find('.button-close').click(close);

                editor.on("keyup", function(e) {
                    if (e.keyCode == 27) {
                    close();
                    }
                });

                var codeMirrors = block.types.map(function(typeInfo, index) {
                    var value = block[typeInfo.language];

                    return CodeMirror(function(elt) {
                    editor.find('.pane').eq(index).append(elt);
                    }, {
                    value: value,
                    language: typeInfo.language,
                    mode: typeInfo.highlight,
                    lineWrapping: true,
                    lineNumbers: true
                    });
                });

                function listing() {
                    return codeMirrors.reduce(function(acc, instance) {
                        acc[instance.options.language] = instance.getValue();

                        return acc;
                    }, {});
                }

                editor.find('.edit-online').click(function() {
                    return framework.editOnline(listing());
                });

                kendo.animationFrame(function() {
                    editor.find(".dialog").removeClass("dialog-enter");
                    codeMirrors[0].focus();
                });

                var preview = new SnippetRunner(editor.find('.pane-preview'));

                var onChange = debounce(function() {
                    var content = framework.runnerContent({
                        listing: listing(),
                        track: false
                    });

                    preview.update(content);
                }, 500);

                setTimeout(function() {
                    codeMirrors.forEach(function(instance) {
                        instance.refresh();
                        instance.on('changes', onChange);
                    });
                }, 400);

                onChange();
            });
          }
      }

      if (window.Clipboard) {
          $(block.elements).prepend('<button class="btn copy-btn">Copy Code</button>');
      }
  });

  if (window.Clipboard) {
      var clipboard = new Clipboard('.copy-btn', {
        text: function(trigger) {
            return $(trigger).next('code').text();
        }
      })

      clipboard.on('success', function(e) {
        setTooltip(e.trigger, 'Copied!');
        hideTooltip(e.trigger);
      });

      $('.copy-btn').tooltip({
        container: 'body',
        trigger: 'click',
        placement: 'bottom'
      });

      function setTooltip(btn, message) {
        $(btn).tooltip('hide')
          .attr('data-original-title', message)
          .tooltip('show');
      }

      function hideTooltip(btn) {
        setTimeout(function() {
          $(btn).tooltip('hide');
        }, 1000);
      }
  }

  function removeJsTrackingMarks(text) {
      if (window.trackjs) {
          text = text.replace(/\/\/trackjs.*/, "").replace(/\/\/sjkcart.*/, "");
          text = text.replace(/\/\*trackjs\*\//, "");
      } else {
          text = text.replace(/\/\*trackjs\*\/.*/g, "");
          text = text.replace(/\/\/trackjs[\s\S]*\/\/sjkcart/gm, "");
      }

      return text;
  }

  function loadMultiFileRunnerContent(element) {
      var filesContent = "";
      var files = $.map(element.find("pre"), function(item) {
            var pre = $(item);
            var codeElem = pre.find("code");
            var code = codeElem.length > 0 ? codeElem.text() : pre.text();
            filesContent = filesContent.concat(code);

            code = prefixStyleUrls(code, "examples/");

            return {
                name: pre.attr("data-file"),
                content: codeToString(removeJsTrackingMarks(code))
            };
      });

      var theme = element.closest("[data-theme]").attr("data-theme") || 'default';
      var content = angularTemplate({
          npmUrl: window.npmUrl,
          exampleRunner: window.runnerScript,
          html: "",
          theme: theme,
          themeAccent: themeColors[theme],
          files: files,
          track: window.trackjs
      });

      return content;
  }

  function processMultiFileSourceBlocks(blockElements, blockId) {
    var elements = blockElements.wrap("<div class='tab-pane'></div>").parent();
    var elemIndex = 0;
    elements.each(function(i, elem){
        var codeBlock = $(this).find("pre");

        if(codeBlock.length > 0 && !codeBlock.is("[data-hidden]")) {
            var elemId = "filename" + elemIndex + "-" + blockId;
            if(elemIndex === 0) { $(this).addClass("active"); }
            elemIndex += 1;
            $(this).attr("id", elemId);
        }
    });

    return elements;
  }

  $(function() {
      $(".demo-embed").each(function() {
          var embeddedDemo = $(this);
          var content = loadMultiFileRunnerContent(embeddedDemo);

          var runnerElement = embeddedDemo.find('.runner');
          var runner = new SnippetRunner(runnerElement);
          runner.update(content);
          runnerElement.data("runner", runner);
      });
  });
});
