// Advanced Mod Converter
// Detects Fabric/Forge, adds EaglerAPI, produces mod folder zip

const fileInput = document.getElementById("modFile");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");

function safeName(name){
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

convertBtn.addEventListener("click", async () => {
    statusEl.innerText = "";
    if (!fileInput.files.length) {
        statusEl.innerText = "Please select at least one .jar/.zip mod.";
        return;
    }

    for (const file of fileInput.files) {
        statusEl.innerText += `Processing: ${file.name}\n`;

        try {
            const inputData = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(inputData);

            let modId = file.name.replace(/\.jar$|\.zip$/i, "");
            let metadata = {};
            let detectedAPI = false;

            // Detect Fabric
            if (zip.file("fabric.mod.json")) {
                const jsonStr = await zip.file("fabric.mod.json").async("string");
                try { metadata = JSON.parse(jsonStr); if (metadata.id) modId = metadata.id; } catch(e){}
                detectedAPI = true;
            }
            // Detect Forge
            else if (zip.file("mcmod.info")) {
                const jsonStr = await zip.file("mcmod.info").async("string");
                try { const parsed = JSON.parse(jsonStr); if (Array.isArray(parsed) && parsed[0]?.modid) modId = parsed[0].modid; } catch(e){}
                detectedAPI = true;
            }

            modId = safeName(modId);
            statusEl.innerText += `Detected mod ID: ${modId}\n`;

            const outZip = new JSZip();
            const modFolder = outZip.folder(modId);

            // Copy all files
            const keys = Object.keys(zip.files);
            const assets = [], data = [], classes = [], otherFiles = [];

            for (const k of keys) {
                const entry = zip.files[k];
                if (entry.dir) continue;

                const content = await entry.async("uint8array");

                if (k.startsWith("assets/")) { modFolder.file(k, content); assets.push(k); }
                else if (k.startsWith("data/")) { modFolder.file(k, content); data.push(k); }
                else if (k.endsWith(".class")) { modFolder.file("classes/" + k, content); classes.push(k); }
                else { modFolder.file(k, content); otherFiles.push(k); }
            }

            // Create mod.json
            const modJson = {
                id: modId,
                name: metadata.name || modId,
                version: metadata.version || "converted",
                description: metadata.description || "",
                requires: detectedAPI ? ["EaglerAPI"] : []
            };
            modFolder.file("mod.json", JSON.stringify(modJson, null, 2));

            // Add mod.js stub
            const stub = [
                `// Auto-generated mod stub for ${modId}`,
                `(function(){`,
                `  if (!window.EaglerAPI && ${detectedAPI}) console.warn('EaglerAPI required for ${modId}');`,
                `  if (window.EaglerAPI?.onInit) { window.EaglerAPI.onInit(()=>{ console.log('${modId} initialized'); }); }`,
                `})();`
            ].join("\n");
            modFolder.file("mod.js", stub);

            // Add conversion report
            modFolder.file("conversion_report.json", JSON.stringify({
                modId,
                originalName: file.name,
                counts: { assets: assets.length, data: data.length, classes: classes.length, other: otherFiles.length },
                notes: ["Classes are kept under classes/ for manual porting", "mod.js is a stub for your EaglerJS logic"]
            }, null, 2));

            // Add minimal EaglerAPI folder if required
            if (detectedAPI) {
                const apiFolder = modFolder.folder("eaglerapi");
                apiFolder.file("manifest.json", JSON.stringify({name:"EaglerAPI", version:"1.0.0"}, null,2));
                apiFolder.file("api.js","// Minimal placeholder for EaglerAPI. Launcher provides full API.");
            }

            // Generate zip and download
            const outBlob = await outZip.generateAsync({ type:"blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(outBlob);
            a.download = `${modId}_EaglerConverted.zip`;
            a.click();

            statusEl.innerText += `Finished: ${modId}\n\n`;

        } catch(err) {
            statusEl.innerText += `Error processing ${file.name}: ${err.message}\n\n`;
        }
    }
});
