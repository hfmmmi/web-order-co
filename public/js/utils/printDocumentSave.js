// 印刷プレビュー画面に PDF（印刷ダイアログ）・PNG（html2canvas）保存を付与
(function (global) {
    function assetUrl(path) {
        const base = String(global.location && global.location.origin ? global.location.origin : "");
        return base + path;
    }

    const HTML2CANVAS_SRC = assetUrl("/js/vendor/html2canvas.min.js");

    function buildToolbarHtml() {
        return (
            '<div class="print-save-toolbar no-print">' +
            '<button type="button" id="btn-save-pdf">PDFで保存</button>' +
            '<button type="button" id="btn-save-png">画像（PNG）で保存</button>' +
            '<button type="button" id="btn-save-print">印刷</button>' +
            '<span class="print-save-hint">PDFは印刷ダイアログで「PDFに保存」を選んでください</span>' +
            "</div>"
        );
    }

    function buildToolbarStyles() {
        return (
            ".print-save-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;" +
            "padding:12px 16px;background:#1f2937;color:#fff;margin:-12px -16px 20px;position:sticky;top:0;z-index:10;}" +
            ".print-save-toolbar button{padding:8px 16px;font-weight:600;border:none;border-radius:0;background:#3b82f6;color:#fff;cursor:pointer;font-size:0.9rem;}" +
            "#btn-save-png{background:#059669;}" +
            "#btn-save-print{background:#4b5563;}" +
            ".print-save-hint{font-size:0.78rem;opacity:0.92;width:100%;text-align:center;margin-top:2px;}" +
            "@media print{.no-print{display:none!important;}}"
        );
    }

    function buildSaveScript(filePrefix, autoFormat) {
        const prefix = String(filePrefix || "document").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const auto = autoFormat === "png" || autoFormat === "pdf" ? autoFormat : "";
        const h2cSrc = HTML2CANVAS_SRC.replace(/'/g, "\\'");
        return (
            "<script src=\"" +
            h2cSrc +
            "\"><\/script>" +
            "<script>(function(){" +
            "var filePrefix='" +
            prefix +
            "';" +
            "function fileStamp(){return filePrefix+'-'+new Date().toISOString().slice(0,10);}" +
            "function waitHtml2canvas(cb, tries){" +
            "if(typeof html2canvas==='function'){cb();return;}" +
            "if(tries<=0){alert('画像保存の読み込みに失敗しました');return;}" +
            "setTimeout(function(){waitHtml2canvas(cb,tries-1);},100);" +
            "}" +
            "window.saveDocumentAsPdf=function(){window.print();};" +
            "window.saveDocumentAsPng=function(){" +
            "var root=document.querySelector('.print-save-root');" +
            "if(!root){alert('保存対象が見つかりません');return;}" +
            "waitHtml2canvas(function(){" +
            "html2canvas(root,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true})" +
            ".then(function(canvas){" +
            "var a=document.createElement('a');" +
            "a.download=fileStamp()+'.png';" +
            "a.href=canvas.toDataURL('image/png');" +
            "document.body.appendChild(a);a.click();a.remove();" +
            "}).catch(function(err){console.error(err);alert('画像の生成に失敗しました');});" +
            "},50);" +
            "};" +
            "function bindButtons(){" +
            "var bPdf=document.getElementById('btn-save-pdf');" +
            "var bPng=document.getElementById('btn-save-png');" +
            "var bPr=document.getElementById('btn-save-print');" +
            "if(bPdf)bPdf.addEventListener('click',function(e){e.preventDefault();window.saveDocumentAsPdf();});" +
            "if(bPng)bPng.addEventListener('click',function(e){e.preventDefault();window.saveDocumentAsPng();});" +
            "if(bPr)bPr.addEventListener('click',function(e){e.preventDefault();window.print();});" +
            "}" +
            "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',bindButtons);}else{bindButtons();}" +
            "var auto='" +
            auto +
            "';" +
            "if(auto==='pdf'){window.addEventListener('load',function(){setTimeout(function(){window.saveDocumentAsPdf();},500);});}" +
            "if(auto==='png'){window.addEventListener('load',function(){setTimeout(function(){window.saveDocumentAsPng();},800);});}" +
            "})();<\/script>"
        );
    }

    /**
     * @param {string} html
     * @param {{ filePrefix?: string, autoFormat?: 'pdf'|'png'|'' }} options
     * @returns {string}
     */
    function wrapPrintHtml(html, options) {
        options = options || {};
        const filePrefix = options.filePrefix || "document";
        const autoFormat = options.autoFormat || "";

        let out = String(html);
        const toolbar = buildToolbarHtml();
        const extraStyle = buildToolbarStyles();
        const script = buildSaveScript(filePrefix, autoFormat);

        if (out.indexOf("print-save-toolbar") < 0) {
            out = out.replace(/<body([^>]*)>/i, "<body$1>" + toolbar + '<div class="print-save-root">');
        }
        if (out.indexOf("print-save-root") < 0) {
            out = out.replace(/<body([^>]*)>/i, "<body$1>" + '<div class="print-save-root">');
        }
        if (out.indexOf("print-save-toolbar{display:flex") < 0) {
            if (out.indexOf("<style>") >= 0) {
                out = out.replace("<style>", "<style>" + extraStyle);
            } else if (out.indexOf("</head>") >= 0) {
                out = out.replace("</head>", "<style>" + extraStyle + "</style></head>");
            }
        }
        if (out.indexOf("saveDocumentAsPng") < 0) {
            const closeIdx = out.lastIndexOf("</body>");
            if (closeIdx >= 0) {
                out = out.slice(0, closeIdx) + "</div>" + script + out.slice(closeIdx);
            }
        }
        return out;
    }

    function openPrintHtmlInNewTab(html) {
        let win = null;
        try {
            win = global.open("", "_blank");
        } catch (err) {
            console.error(err);
        }
        if (!win) {
            if (typeof global.toastError === "function") {
                global.toastError("新しいタブで開けませんでした（ポップアップを許可してください）");
            } else {
                alert("新しいタブで開けませんでした");
            }
            return null;
        }
        try {
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
        } catch (err) {
            console.error(err);
            try {
                win.close();
            } catch (e) {
                /* noop */
            }
            if (typeof global.toastError === "function") {
                global.toastError("保存用ページの表示に失敗しました");
            } else {
                alert("保存用ページの表示に失敗しました");
            }
            return null;
        }
        return win;
    }

    /**
     * @param {string} html
     * @param {{ filePrefix?: string, format?: 'pdf'|'png', preview?: boolean }} options
     */
    function openSavePreview(html, options) {
        options = options || {};
        const format = options.format === "png" ? "png" : "pdf";
        const preview = options.preview !== false;
        const wrapped = wrapPrintHtml(html, {
            filePrefix: options.filePrefix || "document",
            autoFormat: preview ? "" : format
        });
        return openPrintHtmlInNewTab(wrapped);
    }

    global.PrintDocumentSave = {
        buildToolbarHtml,
        buildToolbarStyles,
        wrapPrintHtml,
        openPrintHtmlInNewTab,
        openSavePreview
    };
})(typeof window !== "undefined" ? window : global);
