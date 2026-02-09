// Global State
let allCharacters = [];
let currentCharacter = null;
let savedCharacters = [];
const IMAGE_BASE = 'character_images';
const STORAGE_KEY = 'savedCharacters';

async function loadCharacterData() {
    // REMOVED: Prioritizing window.CHARACTERS_DATA caused stale data issues.
    // We want to force a fresh fetch from CharName.csv every time.
    
    try {
        // 1. Fetch CSV (Master List) - Check server for updates, but don't download if unchanged
        const csvRes = await fetch('CharName.csv', { cache: 'no-cache' });
        if (!csvRes.ok) throw new Error('Failed to load CharName.csv');
        const csvText = await csvRes.text();
        
        // 2. Parse CSV
        const lines = csvText.trim().split('\n');
        // Headers: rank,name,series,kakera
        const headers = lines[0].split(',').map(h => h.trim());
        
        const charList = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const vals = lines[i].split(',');
            
            const charObj = {};
            headers.forEach((h, index) => {
                charObj[h] = vals[index] ? vals[index].trim() : '';
            });
            
            if (charObj.name) {
                charList.push(charObj);
            }
        }

        // 3. Fetch Mapping (Images) - Check server for updates
        let mapping = {};
        try {
            const mappingRes = await fetch('character_image_mapping.json', { cache: 'no-cache' });
            if (mappingRes.ok) {
                mapping = await mappingRes.json();
            }
        } catch (e) {
            console.warn('Mapping file missing or invalid');
        }

        // 4. Merge Image Data into CSV Data
        allCharacters = charList.map(c => ({
            name: c.name,
            series: c.series || '',
            rank: c.rank || '',
            kakera: c.kakera || '0',
            image: mapping[c.name] ? mapping[c.name].filename : ''
        }));
        
        console.log(`Loaded ${allCharacters.length} characters from CSV.`);

    } catch (e) {
        console.error('Failed to load character data:', e);
        // Fallback?
        allCharacters = [];
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadCharacterData();

    const searchInput = document.getElementById('charSearch');
    const suggestionsBox = document.getElementById('suggestions');

    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        suggestionsBox.innerHTML = '';

        if (query.length === 0) {
            suggestionsBox.style.display = 'none';
            return;
        }

        // Filter logic: name or series contains query
        const matches = allCharacters.filter(c => 
            c.name.toLowerCase().includes(query) || 
            (c.series && c.series.toLowerCase().includes(query))
        ).slice(0, 10);

        if (matches.length > 0) {
            matches.forEach(char => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<strong>${char.name}</strong> <small>(${char.series || '—'})</small>`;
                div.onclick = () => navigateTo('/character', char);
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!document.querySelector('.search-container').contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });

    // Custom Image Upload
    document.getElementById('addCustomImageBtn').addEventListener('click', () => {
        document.getElementById('customImageInput').click();
    });

    document.getElementById('customImageInput').addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        if (!currentCharacter) return;
        
        const files = e.target.files;
        const formData = new FormData();
        
        // Append all files with the key 'files'
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        formData.append('character_name', currentCharacter.name);
        
        const statusDiv = document.getElementById('customImageStatus');
        const fileCount = files.length;
        statusDiv.textContent = `Uploading ${fileCount} image${fileCount > 1 ? 's' : ''}... (This may take a moment)`;
        statusDiv.style.color = '#666';
        
        try {
            const res = await fetch('/api/custom-image', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (res.ok) {
                statusDiv.textContent = `${data.message}`;
                statusDiv.style.color = 'green';
                loadCustomImages(currentCharacter.name); // Refresh gallery
            } else {
                statusDiv.textContent = data.error || 'Upload failed';
                statusDiv.style.color = 'red';
                if (data.details) {
                    console.error('Upload errors:', data.details);
                }
            }
        } catch (err) {
            console.error(err);
            statusDiv.textContent = 'Error uploading images';
            statusDiv.style.color = 'red';
        }
        
        e.target.value = '';
    });

    // Home button functionality
    document.querySelector('.navbar-brand').addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo('/');
    });

    // Saved button functionality
    document.getElementById('savedLink').addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo('/saved');
    });
    document.getElementById('addCharLink').addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo('/add');
    });
    document.getElementById('addCharForm').addEventListener('submit', handleAddCharacter);

    // Save button functionality (toggle: save or unsave)
    document.getElementById('saveButton').addEventListener('click', toggleSaveCharacter);

    // Load saved characters from localStorage
    loadSavedCharacters();

    // Handle hash routing
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
});

function navigateTo(path, char) {
    if (path === '/') {
        window.location.hash = '#/';
    } else if (path === '/saved') {
        window.location.hash = '#/saved';
    } else if (path === '/add') {
        window.location.hash = '#/add';
    } else if (path === '/character' && char) {
        window.location.hash = '#/character/' + encodeURIComponent(char.name);
    }
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'saved') {
        showSavedPage();
    } else if (parts[0] === 'add') {
        showAddPage();
    } else if (parts[0] === 'character' && parts[1]) {
        const name = decodeURIComponent(parts[1]);
        const char = allCharacters.find(c => c.name === name) || savedCharacters.find(c => c.name === name);
        if (char) {
            selectCharacter(char);
        } else {
            navigateTo('/');
        }
    } else {
        showHomePage();
    }
}

function showHomePage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('charSearch').value = '';
}

function showAddPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('addPage').style.display = 'block';
}

function showSavedPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('savedPage').style.display = 'block';
    displaySavedCharacters();
}

async function loadSavedCharacters() {
    try {
        // Fetch from API instead of localStorage
        const res = await fetch('/api/saved');
        if (res.ok) {
            savedCharacters = await res.json();
        } else {
            console.error('Failed to load saved characters');
            savedCharacters = [];
        }
        displaySavedCharacters();
    } catch (e) {
        console.error('Error loading saved characters:', e);
        // Fallback to empty if API fails (e.g. static mode)
        savedCharacters = [];
        displaySavedCharacters();
    }
}

// Deprecated: No longer using localStorage for persistence
function persistSavedCharacters() {
    // localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCharacters));
}

function displaySavedCharacters() {
    const container = document.getElementById('savedCharactersContainer');
    container.innerHTML = '';

    if (savedCharacters.length === 0) {
        container.innerHTML = '<div class="empty-saved">No saved characters yet. Save characters from their profile pages!</div>';
        return;
    }

    savedCharacters.forEach(char => {
        const card = document.createElement('div');
        card.className = 'saved-character-card';
        
        const imageUrl = char.image ? `${IMAGE_BASE}/${char.image}` : '';
        const imageHtml = imageUrl 
            ? `<img src="${imageUrl}" alt="${char.name}">` 
            : '<div class="no-image-placeholder">No Image</div>';
        
        card.innerHTML = `
            <div class="saved-card-image-wrap">
                ${imageHtml}
                <button class="saved-card-unsave-btn" title="Unsave character">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
            </div>
            <h4>${char.name}</h4>
        `;
        
        const unsaveBtn = card.querySelector('.saved-card-unsave-btn');
        unsaveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSavedCharacter(char.name, e, true);
        });
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.saved-card-unsave-btn')) {
                navigateTo('/character', char);
            }
        });
        
        container.appendChild(card);
    });
}

function toggleSaveCharacter() {
    if (!currentCharacter) return;

    const isSaved = savedCharacters.some(saved => saved.name === currentCharacter.name);
    if (isSaved) {
        unsaveCharacter(currentCharacter.name);
    } else {
        saveCurrentCharacter();
    }
}

async function saveCurrentCharacter() {
    const saveButton = document.getElementById('saveButton');
    saveButton.disabled = true;
    saveButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';

    if (savedCharacters.some(s => s.name === currentCharacter.name)) {
        saveButton.disabled = false;
        updateSaveButtonState();
        return;
    }

    try {
        const res = await fetch('/api/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentCharacter)
        });
        
        if (res.ok) {
            savedCharacters.push(currentCharacter);
            displaySavedCharacters();
        } else {
            console.error('Failed to save character');
        }
    } catch (e) {
        console.error('Error saving character:', e);
    }
    
    updateSaveButtonState();
}

async function unsaveCharacter(name) {
    const saveButton = document.getElementById('saveButton');
    saveButton.disabled = true;
    saveButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';

    try {
        const res = await fetch(`/api/saved/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            savedCharacters = savedCharacters.filter(c => c.name !== name);
            displaySavedCharacters();
        } else {
            console.error('Failed to remove saved character');
        }
    } catch (e) {
        console.error('Error removing saved character:', e);
    }
    
    updateSaveButtonState();
}

function updateSaveButtonState() {
    if (!currentCharacter) return;
    const saveButton = document.getElementById('saveButton');
    const isSaved = savedCharacters.some(saved => saved.name === currentCharacter.name);
    saveButton.disabled = false;
    if (isSaved) {
        saveButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
        saveButton.style.backgroundColor = 'rgba(40, 167, 69, 0.9)';
    } else {
        saveButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
        saveButton.style.backgroundColor = 'rgba(0, 123, 255, 0.9)';
    }
}

async function removeSavedCharacter(name, event, skipConfirm) {
    if (event) event.stopPropagation();
    if (!skipConfirm && !confirm(`Remove ${name} from saved characters?`)) {
        return;
    }
    
    try {
        const res = await fetch(`/api/saved/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            savedCharacters = savedCharacters.filter(c => c.name !== name);
            displaySavedCharacters();
        } else {
            console.error('Failed to remove saved character');
        }
    } catch (e) {
        console.error('Error removing saved character:', e);
    }
    
    if (currentCharacter && currentCharacter.name === name) {
        updateSaveButtonState();
    }
}

// Lightbox State
let galleryImages = [];
let currentGalleryIndex = 0;

function openModal(index) {
    currentGalleryIndex = index;
    const modal = document.getElementById('imageModal');
    modal.style.display = 'flex';
    updateModalImage();
}

function closeModal() {
    document.getElementById('imageModal').style.display = 'none';
}

function changeImage(n) {
    currentGalleryIndex += n;
    if (currentGalleryIndex >= galleryImages.length) currentGalleryIndex = 0;
    if (currentGalleryIndex < 0) currentGalleryIndex = galleryImages.length - 1;
    updateModalImage();
}

function updateModalImage() {
    const img = document.getElementById('modalImage');
    if (galleryImages[currentGalleryIndex]) {
        img.src = galleryImages[currentGalleryIndex];
        document.getElementById('modalCounter').innerText = `${currentGalleryIndex + 1} / ${galleryImages.length}`;
    }
}

// Lightbox Event Listeners
document.getElementById('modalClose').onclick = closeModal;
document.getElementById('modalPrev').onclick = (e) => { e.stopPropagation(); changeImage(-1); };
document.getElementById('modalNext').onclick = (e) => { e.stopPropagation(); changeImage(1); };
document.getElementById('imageModal').onclick = (e) => {
    if (e.target === document.getElementById('imageModal')) closeModal();
};
document.addEventListener('keydown', (e) => {
    if (document.getElementById('imageModal').style.display === 'flex') {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') changeImage(-1);
        if (e.key === 'ArrowRight') changeImage(1);
    }
});

async function loadCustomImages(name) {
    const gallery = document.getElementById('customImagesGallery');
    if (!gallery) return;
    
    // Reset Gallery List
    galleryImages = [];
    
    try {
        const res = await fetch(`/api/custom-image/${encodeURIComponent(name)}`, { cache: 'no-cache' });
        let customUrls = [];
        if (res.ok) {
            customUrls = await res.json();
            galleryImages = customUrls;
        }
        
        // Render Gallery (Custom Images only)
        gallery.innerHTML = '';
        
        // If we have custom images, render them
        if (customUrls.length > 0) {
            customUrls.forEach((url, i) => {
                const img = document.createElement('img');
                img.src = url;
                // Increased quality settings:
                img.style.height = '250px'; // Taller
                img.style.width = 'auto';   // Maintain aspect ratio (no squishing/cropping)
                img.style.maxWidth = '100%'; 
                img.style.objectFit = 'contain';
                
                img.style.borderRadius = '8px';
                img.style.cursor = 'pointer';
                img.style.border = '1px solid #ddd';
                img.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
                
                img.onclick = () => openModal(i);
                gallery.appendChild(img);
            });
        }
        
        // Reset main image cursor since it's no longer clickable
        const mainImg = document.getElementById('charImageDisplay');
        if (mainImg) {
            mainImg.style.cursor = 'default';
            mainImg.onclick = null;
        }

    } catch (e) {
        console.error('Error loading custom images:', e);
    }
}

function selectCharacter(char) {
    currentCharacter = char;
    document.getElementById('charSearch').value = char.name;
    document.getElementById('suggestions').style.display = 'none';
    
    const selectedDiv = document.getElementById('selectedCharacter');
    document.getElementById('charNameDisplay').innerText = char.name;
    document.getElementById('charSeriesDisplay').innerText = `Series: ${char.series || '—'}`;
    document.getElementById('charRankDisplay').innerText = `Rank: ${char.rank || '—'}`;
    document.getElementById('customImageStatus').textContent = ''; // Clear status
    loadCustomImages(char.name); // Load custom images gallery
    
    // Display character image if available
    const imageDisplay = document.getElementById('charImageDisplay');
    if (char.image) {
        imageDisplay.src = `${IMAGE_BASE}/${char.image}`;
        imageDisplay.style.display = 'block';
        imageDisplay.alt = char.name;
    } else {
        imageDisplay.style.display = 'none';
    }
    
    // Update save button state (always clickable - toggles save/unsave)
    updateSaveButtonState();
    
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    
    selectedDiv.style.display = 'flex';
    document.getElementById('customImagesSection').style.display = 'block';
    
    document.getElementById('customImageStatus').textContent = ''; 
    // Removed duplicate loadCustomImages(char.name) call
}

async function handleAddCharacter(e) {
    e.preventDefault();
    const name = document.getElementById('addCharName').value.trim();
    const series = document.getElementById('addCharSeries').value.trim();
    const kakera = document.getElementById('addCharKakera').value.trim() || '0';
    if (!name) {
        showAddCharStatus('Please enter a name.', 'error');
        return;
    }
    if (allCharacters.some(c => c.name === name)) {
        showAddCharStatus(`Character "${name}" already exists.`, 'error');
        return;
    }
    const btn = document.getElementById('addCharSubmitBtn');
    btn.disabled = true;
    try {
        const res = await fetch('/api/add-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, series, kakera })
        });
        const data = await res.json();
        if (res.ok) {
            allCharacters.push({ name, image: '', series, rank: '' });
            document.getElementById('addCharForm').reset();
            document.getElementById('addCharKakera').value = '0';
            showAddCharStatus(`Added "${name}" to CharName.csv.`, 'success');
        } else {
            showAddCharStatus(data.error || 'Failed to add character.', 'error');
        }
    } catch (err) {
        showAddCharStatus('Could not reach server. Run the app with Python (python upload_imgchest.py --web) to add characters.', 'error');
    }
    btn.disabled = false;
}

function showAddCharStatus(msg, type) {
    const el = document.getElementById('addCharStatus');
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';
}