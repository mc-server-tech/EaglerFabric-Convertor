let fileInput = document.getElementById("modFile");
let convertBtn = document.getElementById("convertBtn");
let statusDiv = document.getElementById("status");

convertBtn.onclick = async () => {
    let files = Array.from(fileInput.files);
    if (!files.length) {
        statusDiv.textContent = "Select one or more .jar mod files first.";
        return;
    }

    statusDiv.textContent = "Reading mods...";

    for (const file of files) {
        const zip = await JSZip.loadAsync(file);
        const outputZip = new JSZip();
        const modFolder = outputZip.folder("mod");

        let hasJavaClasses = false;
        let metadata = {};
        let needsEaglerAPI = false;

        await Promise.all(Object.keys(zip.files).map(async path => {
            const entry = zip.files[path];

            if (entry.dir) return;

            if (path.endsWith(".class")) {
                hasJavaClasses = true;
                return;
            }

            if (path === "fabric.mod.json" || path === "mcmod.info") {
                const raw = await entry.async("string");
                try {
                    metadata = JSON.parse(raw);
                    if (metadata.depends) {
                        for (const dep in metadata.depends) {
                            if (dep.toLowerCase().includes("fabric")) {
                                needsEaglerAPI = true;
                            }
                        }
                    }
                } catch (e) {
                    metadata = {};
                }
                return;
            }

            const fileData = await entry.async("uint8array");
            modFolder.file(path, fileData);
        }));

        metadata = metadata || {};
        const modName = metadata.id || file.name.replace(".jar","");
        const modVersion = metadata.version || "1.0";

        // Add EaglerAPI as dependency if needed
        const convertedModJSON = {
            id: modName,
            name: metadata.name || modName,
            version: modVersion
        };
        if (needsEaglerAPI) {
            convertedModJSON.requires = ["EaglerAPI"];
        }

        modFolder.file("mod.json", JSON.stringify(convertedModJSON, null, 2));

        let warn = "";
        if (hasJavaClasses) {
            warn = " WARNING: This mod contains Java classes. Some features may not work in WASM.";
        }
        if (needsEaglerAPI) {
            warn += " Note: This mod requires EaglerAPI for Fabric API functionality.";
        }

        statusDiv.textContent = `Packaging converted mod: ${modName}...${warn}`;

        const finalZip = await outputZip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(finalZip);
        a.download = `${modName}_EaglerFabric.zip`;
        a.textContent = `Download ${modName}_EaglerFabric.zip`;
        a.style.display = "block";
        document.getElementById("status").appendChild(a);
    }

    statusDiv.textContent += " Conversion complete.";
};
