function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}

// Global State
let allCharacters = [];
let currentCharacter = null;
let savedCharacters = [];
const IMAGE_BASE = 'character_images';
const STORAGE_KEY = 'savedCharacters';
let searchMatches = [];
let visibleSearchLimit = 10;
let cachedCustoms = [];

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
    const sortSelect = document.getElementById('sortSelect');
    
    function updateSearch() {
        const query = searchInput.value.toLowerCase();
        const sortMode = sortSelect.value;
        
        if (query.length === 0) {
            suggestionsBox.style.display = 'none';
            return;
        }

        // Filter
        searchMatches = allCharacters.filter(c => 
            c.name.toLowerCase().includes(query) || 
            (c.series && c.series.toLowerCase().includes(query))
        );

        // Sort
        searchMatches.sort((a, b) => {
            if (sortMode === 'name') return a.name.localeCompare(b.name);
            if (sortMode === 'series') {
                const sA = a.series || '';
                const sB = b.series || '';
                return sA.localeCompare(sB);
            }
            if (sortMode === 'rank') {
                const rA = parseInt(a.rank) || 999999;
                const rB = parseInt(b.rank) || 999999;
                return rA - rB;
            }
            return 0;
        });

        // Reset limit and render
        visibleSearchLimit = 10;
        renderSuggestions();
        
        // If Search Page is open, refresh it too
        if (document.getElementById('searchPage').style.display === 'block') {
            showSearchPage();
        }
    }

    function renderSuggestions() {
        suggestionsBox.innerHTML = '';
        
        const visibleMatches = searchMatches.slice(0, visibleSearchLimit);

        if (visibleMatches.length > 0) {
            visibleMatches.forEach(char => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<strong>${char.name}</strong> <small>(${char.series || '—'})</small>`;
                div.onclick = () => navigateTo('/character', char);
                suggestionsBox.appendChild(div);
            });

            // "Load More" Button
            if (searchMatches.length > visibleSearchLimit) {
                const remaining = searchMatches.length - visibleSearchLimit;
                const loadMoreDiv = document.createElement('div');
                loadMoreDiv.className = 'suggestion-item load-more';
                loadMoreDiv.innerHTML = `<strong>Load More results...</strong> <small>(${remaining} remaining)</small>`;
                loadMoreDiv.onclick = (e) => {
                    e.stopPropagation(); // Prevent closing
                    visibleSearchLimit += 10;
                    renderSuggestions();
                };
                suggestionsBox.appendChild(loadMoreDiv);
            }

            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    }

    searchInput.addEventListener('input', updateSearch);
    searchInput.addEventListener('focus', updateSearch); // Show results on click/focus
    sortSelect.addEventListener('change', updateSearch);
    
    // Enter key for Advanced Search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            showSearchPage();
            searchInput.blur();
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!document.querySelector('.search-container').contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });

    // Custom Image Upload
    // Drop Zone Logic
    const dropZone = document.getElementById('customImagesSection');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight(e) {
        dropZone.classList.add('drag-over');
    }
    
    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }
    
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            uploadCustomImages(files);
        }
    }

    document.getElementById('customImageInput').addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        uploadCustomImages(e.target.files);
        e.target.value = ''; // Reset input
    });

    // Customs Page Event Listeners
    document.getElementById('customsSearch').addEventListener('input', renderCustoms);
    document.getElementById('customsSort').addEventListener('change', renderCustoms);
    document.getElementById('customsSeriesFilter').addEventListener('change', renderCustoms);

    // ... Main Image Upload ...
    document.getElementById('mainImageInput').addEventListener('change', async (e) => {

        if (!e.target.files.length) return;
        if (!currentCharacter) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('character_name', currentCharacter.name);
        
        // Show loading state on the image
        const imgDisplay = document.getElementById('charImageDisplay');
        const originalOpacity = imgDisplay.style.opacity;
        imgDisplay.style.opacity = '0.5';
        
        try {
            const res = await fetch('/api/set-main-image', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (res.ok) {
                // Update character data
                currentCharacter.image = data.image_url;
                // Update list in memory
                const charInList = allCharacters.find(c => c.name === currentCharacter.name);
                if (charInList) charInList.image = data.image_url;
                
                // Update UI
                selectCharacter(currentCharacter);
                showToast('Main image updated!', 'success');
            } else {
                showToast(data.error || 'Failed to set main image', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error uploading main image', 'error');
        }
        
        imgDisplay.style.opacity = originalOpacity;
        e.target.value = '';
    });

    // Home button functionality
    document.querySelector('.navbar-brand').addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo('/');
    });

    // Customs button functionality
    document.getElementById('customsLink').addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo('/customs');
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

function showSearchPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('suggestions').style.display = 'none';
    document.getElementById('customsPage').style.display = 'none';
    
    const searchPage = document.getElementById('searchPage');
    searchPage.style.display = 'block';
    
    const list = document.getElementById('searchResultsList');
    list.innerHTML = '';
    
    document.getElementById('searchCount').textContent = `Found ${searchMatches.length} result${searchMatches.length !== 1 ? 's' : ''}`;
    
    // Render first 50
    const toRender = searchMatches.slice(0, 50);
    
    if (toRender.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding: 20px;">No results found.</p>';
        return;
    }
    
    toRender.forEach(char => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.onclick = () => navigateTo('/character', char);
        
        const imgUrl = getImageUrl(char.image);
        const img = document.createElement('img');
        img.className = 'search-result-img';
        img.src = imgUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMSI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48L3N2Zz4=';
        
        const info = document.createElement('div');
        info.className = 'search-result-info';
        info.innerHTML = `
            <h3>${char.name}</h3>
            <p><strong>Series:</strong> ${char.series || '—'}</p>
            <p><strong>Rank:</strong> ${char.rank || '—'}</p>
        `;
        
        item.appendChild(img);
        item.appendChild(info);
        list.appendChild(item);
    });
    
    if (searchMatches.length > 50) {
         const more = document.createElement('div');
         more.style.textAlign = 'center';
         more.style.padding = '20px';
         more.style.color = '#666';
         more.textContent = `And ${searchMatches.length - 50} more... (Refine search to see them)`;
         list.appendChild(more);
    }
}

function navigateTo(path, char) {
    if (path === '/') {
        window.location.hash = '#/';
    } else if (path === '/saved') {
        window.location.hash = '#/saved';
    } else if (path === '/add') {
        window.location.hash = '#/add';
    } else if (path === '/customs') {
        window.location.hash = '#/customs';
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
    } else if (parts[0] === 'customs') {
        showCustomsPage();
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
    document.getElementById('searchPage').style.display = 'none';
    document.getElementById('customsPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('charSearch').value = '';
}

function showAddPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('searchPage').style.display = 'none';
    document.getElementById('customsPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'block';
}

function showSavedPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('searchPage').style.display = 'none';
    document.getElementById('customsPage').style.display = 'none';
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

// Helper to resolve image URLs
function getImageUrl(imagePath) {
    if (!imagePath) return '';
    if (imagePath.startsWith('http') || imagePath.startsWith('//')) {
        return imagePath;
    }
    return `${IMAGE_BASE}/${imagePath}`;
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
        
        // Use fresh image data from allCharacters if available
        const freshChar = allCharacters.find(c => c.name === char.name);
        const imageToUse = freshChar ? freshChar.image : char.image;
        
        const imageUrl = getImageUrl(imageToUse);
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

function enableEditMode() {
    console.log('Edit mode toggled');
    if (!currentCharacter) {
        console.error('No character selected');
        return;
    }
    isEditing = true;
    
    // Populate form
    document.getElementById('editCharName').value = currentCharacter.name;
    document.getElementById('editCharSeries').value = currentCharacter.series || '';
    document.getElementById('editCharRank').value = currentCharacter.rank || '';
    
    // Toggle UI
    document.getElementById('charDisplayMode').style.display = 'none';
    document.getElementById('charEditMode').style.display = 'block';
    
    // Enable Gallery Editing (Show Delete Buttons)
    document.getElementById('customImagesGallery').classList.add('gallery-editing');
    loadCustomImages(currentCharacter.name); // Reload to show delete buttons if they weren't rendered
}

function disableEditMode() {
    isEditing = false;
    document.getElementById('charDisplayMode').style.display = 'block';
    document.getElementById('charEditMode').style.display = 'none';
    document.getElementById('customImagesGallery').classList.remove('gallery-editing');
}

async function saveEdit() {
    const newName = document.getElementById('editCharName').value.trim();
    const newSeries = document.getElementById('editCharSeries').value.trim();
    const newRank = document.getElementById('editCharRank').value.trim();
    
    if (!newName) {
        showToast('Name cannot be empty', 'error');
        return;
    }
    
    const payload = {
        original_name: currentCharacter.name,
        new_name: newName,
        series: newSeries,
        rank: newRank
    };
    
    // Disable button
    const btn = document.getElementById('saveEditBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    
    try {
        const res = await fetch('/api/edit-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (res.ok) {
            // Update local data
            const oldName = currentCharacter.name;
            currentCharacter.name = newName;
            currentCharacter.series = newSeries;
            currentCharacter.rank = newRank;
            
            // Update in allCharacters
            const index = allCharacters.findIndex(c => c.name === oldName);
            if (index !== -1) {
                allCharacters[index] = { ...allCharacters[index], ...currentCharacter };
            }
            
            // Update in savedCharacters if present
            const savedIndex = savedCharacters.findIndex(c => c.name === oldName);
            if (savedIndex !== -1) {
                savedCharacters[savedIndex] = { ...savedCharacters[savedIndex], ...currentCharacter };
            }
            
            disableEditMode();
            
            // Refresh UI
            if (oldName !== newName) {
                navigateTo('/character', currentCharacter); // Update URL
            } else {
                selectCharacter(currentCharacter);
            }
            
            showToast('Character updated!', 'success');
        } else {
            showToast(data.error || 'Failed to update character', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error saving changes', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = 'Save';
}

async function deleteCustomImage(url) {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
        const res = await fetch('/api/delete-custom-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character_name: currentCharacter.name,
                image_url: url
            })
        });
        
        if (res.ok) {
            // Refresh gallery
            loadCustomImages(currentCharacter.name);
            showToast('Image deleted', 'success');
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to delete image', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error deleting image', 'error');
    }
}

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
                // Wrapper for image + delete button
                const wrapper = document.createElement('div');
                wrapper.className = 'gallery-item-wrapper';
                
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
                
                // Delete Button
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-btn';
                delBtn.innerHTML = '&times;';
                delBtn.title = 'Delete image';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteCustomImage(url);
                };
                
                wrapper.appendChild(img);
                wrapper.appendChild(delBtn);
                gallery.appendChild(wrapper);
            });
        }
        
        // Check if editing mode is active to show delete buttons
        if (isEditing) {
            gallery.classList.add('gallery-editing');
        } else {
            gallery.classList.remove('gallery-editing');
        }
        
        // Reset main image cursor since it's no longer clickable
        // Only if we have a real main image (not a placeholder)
        const mainImg = document.getElementById('charImageDisplay');
        if (mainImg && currentCharacter && currentCharacter.image) {
            mainImg.style.cursor = 'default';
            mainImg.onclick = null;
        }

    } catch (e) {
        console.error('Error loading custom images:', e);
    }
}

function selectCharacter(char) {
    currentCharacter = char;
    document.getElementById('charSearch').value = ''; // Clear search bar
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
        imageDisplay.src = getImageUrl(char.image);
        imageDisplay.style.display = 'block';
        imageDisplay.alt = char.name;
        imageDisplay.style.cursor = 'pointer';
        imageDisplay.style.backgroundColor = 'transparent';
        imageDisplay.onclick = () => openModal(0);
    } else {
        // Placeholder for missing image
        imageDisplay.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzY2NiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiPjwvcG9seWxpbmU+PC9zdmc+'; // Simple icon
        imageDisplay.style.display = 'block';
        imageDisplay.alt = 'Click to set main image';
        imageDisplay.style.backgroundColor = '#f0f0f0';
        imageDisplay.style.padding = '20px';
        imageDisplay.style.cursor = 'pointer';
        imageDisplay.title = 'Click to upload main image';
        
        // Click to upload
        imageDisplay.onclick = () => {
            document.getElementById('mainImageInput').click();
        };
    }
    
    // Update save button state (always clickable - toggles save/unsave)
    updateSaveButtonState();
    
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('searchPage').style.display = 'none';
    document.getElementById('customsPage').style.display = 'none';
    
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
    btn.innerHTML = '<span class="spinner"></span> Adding...';
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
    btn.textContent = 'Add Character';
}

function showAddCharStatus(msg, type) {
    const el = document.getElementById('addCharStatus');
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';
}

async function uploadCustomImages(files) {
    if (!currentCharacter) return;
    
    const formData = new FormData();
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
            showToast(`${fileCount} image(s) uploaded`, 'success');
        } else {
            statusDiv.textContent = data.error || 'Upload failed';
            statusDiv.style.color = 'red';
            showToast('Upload failed', 'error');
            if (data.details) {
                console.error('Upload errors:', data.details);
            }
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = 'Error uploading images';
        statusDiv.style.color = 'red';
        showToast('Error uploading images', 'error');
    }
}

async function showCustomsPage() {
    document.getElementById('selectedCharacter').style.display = 'none';
    document.getElementById('customImagesSection').style.display = 'none';
    document.getElementById('savedPage').style.display = 'none';
    document.getElementById('addPage').style.display = 'none';
    document.getElementById('searchPage').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    
    const page = document.getElementById('customsPage');
    page.style.display = 'block';
    
    const list = document.getElementById('customsList');
    list.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
    
    try {
        const res = await fetch('custom_images.json', { cache: 'no-cache' });
        let customData = {};
        if (res.ok) {
            customData = await res.json();
        }
        
        const names = Object.keys(customData);
        // Filter out empty arrays
        const activeNames = names.filter(n => customData[n] && customData[n].length > 0);
        
        // Enrich characters
        cachedCustoms = allCharacters
            .filter(c => activeNames.includes(c.name))
            .map(c => ({
                ...c,
                customImages: customData[c.name] || [],
                customCount: (customData[c.name] || []).length
            }));
            
        // Populate Series Filter
        const seriesSet = new Set(cachedCustoms.map(c => c.series).filter(Boolean));
        const seriesList = Array.from(seriesSet).sort();
        
        const seriesSelect = document.getElementById('customsSeriesFilter');
        // Save current selection if re-rendering? No, usually fresh open resets.
        seriesSelect.innerHTML = '<option value="all">All Series</option>';
        seriesList.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            seriesSelect.appendChild(opt);
        });
        
        renderCustoms();
        
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="text-align:center; color:red;">Failed to load custom images list.</p>';
    }
}

function renderCustoms() {
    const list = document.getElementById('customsList');
    const searchVal = document.getElementById('customsSearch').value.toLowerCase();
    const sortMode = document.getElementById('customsSort').value;
    const seriesFilter = document.getElementById('customsSeriesFilter').value;
    
    // Filter
    let filtered = cachedCustoms.filter(char => {
        // Search
        if (searchVal) {
            const inName = char.name.toLowerCase().includes(searchVal);
            const inSeries = (char.series || '').toLowerCase().includes(searchVal);
            if (!inName && !inSeries) return false;
        }
        // Series Filter
        if (seriesFilter !== 'all') {
            if (char.series !== seriesFilter) return false;
        }
        return true;
    });
    
    // Sort
    filtered.sort((a, b) => {
        if (sortMode === 'name_asc') return a.name.localeCompare(b.name);
        if (sortMode === 'name_desc') return b.name.localeCompare(a.name);
        if (sortMode === 'series_asc') return (a.series || '').localeCompare(b.series || '');
        if (sortMode === 'rank_asc') {
             const rA = parseInt(a.rank) || 999999;
             const rB = parseInt(b.rank) || 999999;
             return rA - rB;
        }
        if (sortMode === 'count_desc') return b.customCount - a.customCount;
        if (sortMode === 'count_asc') return a.customCount - b.customCount;
        return 0;
    });
    
    // Render
    list.innerHTML = '';
    const countEl = document.getElementById('customsCount');
    if (countEl) countEl.textContent = `Found ${filtered.length} character${filtered.length !== 1 ? 's' : ''}`;
    
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding: 20px;">No characters found matching filters.</p>';
        return;
    }
    
    filtered.forEach(char => {
         const item = document.createElement('div');
         item.className = 'search-result-item';
         item.onclick = () => navigateTo('/character', char);
         
         const imgUrl = getImageUrl(char.image);
         const img = document.createElement('img');
         img.className = 'search-result-img';
         img.src = imgUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMSI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48L3N2Zz4=';

         const info = document.createElement('div');
         info.className = 'search-result-info';
         
         let infoHtml = `
            <h3>${char.name}</h3>
            <p><strong>Series:</strong> ${char.series || '—'}</p>
            <p><strong>Custom Images:</strong> ${char.customCount}</p>
         `;
         
         if (char.customCount > 0) {
             const previews = char.customImages.slice(0, 3);
             let previewHtml = '<div class="custom-preview-row">';
             previews.forEach(url => {
                 previewHtml += `<img src="${url}" class="preview-thumb" alt="Preview">`;
             });
             previewHtml += '</div>';
             infoHtml += previewHtml;
         }
         
         info.innerHTML = infoHtml;
         
         item.appendChild(img);
         item.appendChild(info);
         list.appendChild(item);
    });
}