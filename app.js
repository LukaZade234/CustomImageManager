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
let isReordering = false;
let isDeleting = false;
let isAiCommand = false;
let isEditing = false;

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
    const searchToggle = document.getElementById('searchModeToggle');
    const labelName = document.getElementById('searchLabelName');
    const labelSeries = document.getElementById('searchLabelSeries');
    const searchToggleWrapper = document.getElementById('searchToggleWrapper');
    
    // Sort Dropdown Logic
    const sortContainer = document.getElementById('sortDropdownContainer');
    const sortTrigger = document.getElementById('sortDropdownTrigger');
    const sortOptions = document.getElementById('sortDropdownOptions');
    const sortHiddenInput = document.getElementById('sortSelect');
    const currentSortLabel = document.getElementById('currentSortLabel');
    
    // Toggle Dropdown
    sortTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = sortContainer.classList.contains('active');
        
        if (isActive) {
            closeSortDropdown();
        } else {
            openSortDropdown();
        }
    });
    
    function openSortDropdown() {
        sortContainer.classList.add('active');
        sortContainer.classList.add('expanded'); // Ensure full width on mobile
        sortOptions.classList.add('show');
    }
    
    function closeSortDropdown() {
        sortContainer.classList.remove('active');
        sortOptions.classList.remove('show');
        
        // On mobile: Check if we should collapse width
        if (window.innerWidth <= 992) {
            // Delay collapse to show selection briefly? Or just collapse?
            // User requested: "make it automatically collapse after clicked on mobile like the toggle"
            setTimeout(() => {
                sortContainer.classList.remove('expanded');
            }, 1000); // 1s delay before shrinking
        }
    }
    
    // Handle Option Click
    sortOptions.querySelectorAll('.dropdown-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.dataset.value;
            const label = option.textContent;
            
            // Update UI
            currentSortLabel.textContent = label;
            sortHiddenInput.value = value;
            
            // Update Active State
            sortOptions.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            
            // Trigger Search Update
            updateSearch();
            
            // Close
            closeSortDropdown();
        });
    });
    
    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!sortContainer.contains(e.target)) {
            sortContainer.classList.remove('active');
            sortOptions.classList.remove('show');
            // Remove expanded on outside click
            sortContainer.classList.remove('expanded');
        }
    });

    // Toggle Event for Search Mode
    searchToggle.addEventListener('change', () => {
        // Expand briefly to show change
        searchToggleWrapper.classList.add('expanded');
        setTimeout(() => {
            searchToggleWrapper.classList.remove('expanded');
        }, 1000);

        if (searchToggle.checked) {
            // Series Mode
            searchInput.placeholder = 'Search series...';
            labelName.classList.remove('active');
            labelSeries.classList.add('active');
        } else {
            // Name Mode
            searchInput.placeholder = 'Search characters...';
            labelSeries.classList.remove('active');
            labelName.classList.add('active');
        }
        updateSearch();
    });

    // Handle Hover/Click for Toggle Expansion
    // Desktop: Hover
    searchToggleWrapper.addEventListener('mouseenter', () => {
        searchToggleWrapper.classList.add('expanded');
    });
    searchToggleWrapper.addEventListener('mouseleave', () => {
        if (!searchToggle.checked && !document.activeElement.closest('.search-toggle-wrapper')) {
             searchToggleWrapper.classList.remove('expanded');
        } else if (searchToggle.checked) {
             searchToggleWrapper.classList.remove('expanded');
        }
    });

    // Mobile/Click
    searchToggleWrapper.addEventListener('click', (e) => {
        // If clicking the switch itself, let the change event handle the collapse timeout
        if (e.target.tagName === 'INPUT' || e.target.classList.contains('slider')) return;
        
        searchToggleWrapper.classList.add('expanded');
        // Auto collapse after 3s if no interaction
        setTimeout(() => {
            // Only collapse if mouse is not over (for desktop safety)
            // For mobile, this just collapses it
            searchToggleWrapper.classList.remove('expanded');
        }, 3000);
    });
    
    function updateSearch() {
        const query = searchInput.value.toLowerCase();
        // Use hidden input value
        const sortMode = document.getElementById('sortSelect').value; 
        const searchBySeries = searchToggle.checked;
        
        if (query.length === 0) {
            suggestionsBox.style.display = 'none';
            // If search is cleared, return to the current route's view
            handleRoute(); 
            return;
        }

        // Filter
        searchMatches = allCharacters.filter(c => {
            if (searchBySeries) {
                return c.series && c.series.toLowerCase().includes(query);
            } else {
                return c.name.toLowerCase().includes(query);
            }
        });

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

        // Hide dropdown suggestions (user wants direct page results)
        suggestionsBox.style.display = 'none';
        
        // Directly show the full results page
        showSearchPage();
    }

    function renderSuggestions() {
        suggestionsBox.innerHTML = '';
        
        const visibleMatches = searchMatches.slice(0, visibleSearchLimit);

        if (visibleMatches.length > 0) {
            visibleMatches.forEach(char => {
                const div = document.createElement('a'); // Changed to <a>
                div.href = '#/character/' + encodeURIComponent(char.name); // Set href
                div.className = 'suggestion-item';
                div.innerHTML = `<strong>${char.name}</strong> <small>(${char.series || '—'})</small>`;
                // div.onclick = () => navigateTo('/character', char); // Removed onclick
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

    // searchInput.addEventListener('input', updateSearch); // Handled below
    searchInput.addEventListener('input', updateSearch);
    searchInput.addEventListener('focus', updateSearch); // Show results on click/focus
    // sortSelect.addEventListener('change', updateSearch); // Removed, handled by custom dropdown
    
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
        // Only highlight if dragging files from OS
        if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
            dropZone.classList.add('drag-over');
        }
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
        uploadMainImage(e.target.files[0]);
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
    
    // Load Stats
    loadStats();

    // Setup Series Autocomplete
    setupSeriesAutocomplete(document.getElementById('addCharSeries'), document.getElementById('addSeriesSuggestions'));
    setupSeriesAutocomplete(document.getElementById('editCharSeries'), document.getElementById('editSeriesSuggestions'));

    // Handle hash routing
    window.addEventListener('hashchange', handleRoute);
    handleRoute();

    // Dark Mode Logic
    console.log('Initializing Dark Mode Logic');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    console.log('Dark Mode Elements:', {
        toggle: darkModeToggle,
        sun: sunIcon,
        moon: moonIcon
    });

    // Check saved preference
    const savedTheme = localStorage.getItem('theme');
    console.log('Saved theme:', savedTheme);

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            console.log('Dark mode toggle clicked');
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateThemeIcon(isDark);
        });
    } else {
        console.error('Dark mode toggle button not found!');
    }

    function updateThemeIcon(isDark) {
        console.log('Updating theme icon, isDark:', isDark);
        if (isDark) {
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'block';
        } else {
            if (sunIcon) sunIcon.style.display = 'block';
            if (moonIcon) moonIcon.style.display = 'none';
        }
    }
});

async function loadStats() {
    try {
        const res = await fetch('custom_images.json', { cache: 'no-cache' });
        if (res.ok) {
            const customData = await res.json();
            const names = Object.keys(customData);
            
            // Calculate totals
            let totalImages = 0;
            let totalChars = 0;
            
            names.forEach(name => {
                const images = customData[name];
                if (images && images.length > 0) {
                    totalChars++;
                    totalImages += images.length;
                }
            });
            
            // Animate Numbers
            animateValue("totalImagesCount", 0, totalImages, 1000);
            animateValue("totalCharsCount", 0, totalChars, 1000);
            
        } else {
            console.warn('Failed to load stats');
            document.getElementById('totalImagesCount').textContent = '0';
            document.getElementById('totalCharsCount').textContent = '0';
        }
    } catch (e) {
        console.error('Error loading stats:', e);
        document.getElementById('totalImagesCount').textContent = '0';
        document.getElementById('totalCharsCount').textContent = '0';
    }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function setupSeriesAutocomplete(input, container) {
    if (!input || !container) return;

    input.addEventListener('input', function(e) {
        const val = this.value;
        closeAllLists();
        if (!val) return false;
        
        container.style.display = 'block';
        container.innerHTML = '';
        
        // Get unique series
        const seriesSet = new Set(allCharacters.map(c => c.series).filter(s => s));
        const uniqueSeries = Array.from(seriesSet).sort();
        
        // Filter matches
        const matches = uniqueSeries.filter(s => s.toLowerCase().includes(val.toLowerCase()));
        
        matches.slice(0, 10).forEach(series => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            // Highlight match
            const regex = new RegExp(`(${val})`, "gi");
            item.innerHTML = series.replace(regex, "<strong>$1</strong>");
            item.innerHTML += `<input type='hidden' value="${series}">`;
            
            item.addEventListener('click', function(e) {
                input.value = this.getElementsByTagName("input")[0].value;
                closeAllLists();
            });
            container.appendChild(item);
        });
        
        if (matches.length === 0) {
            container.style.display = 'none';
        }
    });
    
    // Close on click outside
    document.addEventListener("click", function (e) {
        if (e.target !== input && e.target !== container) {
            container.style.display = 'none';
        }
    });
    
    function closeAllLists() {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

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
        const item = document.createElement('a'); // Changed to <a>
        item.href = '#/character/' + encodeURIComponent(char.name); // Set href
        item.className = 'search-result-item';
        // item.onclick = () => navigateTo('/character', char); // Removed onclick
        
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
        const card = document.createElement('a'); // Changed to <a>
        card.href = '#/character/' + encodeURIComponent(char.name); // Set href
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
            e.preventDefault(); // Prevent link following
            e.stopPropagation();
            removeSavedCharacter(char.name, e, true);
        });
        
        // card.addEventListener('click', ...); // Removed, handled by <a>
        
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
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    updateModalImage();
}

function closeModal() {
    document.getElementById('imageModal').style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
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

// Swipe Support for Mobile
let touchStartX = 0;
let touchEndX = 0;
const modal = document.getElementById('imageModal');

modal.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

modal.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, {passive: true});

function handleSwipe() {
    if (touchEndX < touchStartX - 50) {
        changeImage(1); // Swipe Left -> Next
    }
    if (touchEndX > touchStartX + 50) {
        changeImage(-1); // Swipe Right -> Prev
    }
}

// Main Image Drag and Drop Handlers
function handleMainDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = document.querySelector('.image-wrapper');
    if (wrapper.classList.contains('edit-mode')) {
        wrapper.classList.add('drag-over-main');
    }
}

function handleMainDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = document.querySelector('.image-wrapper');
    if (wrapper.classList.contains('edit-mode')) {
        wrapper.classList.add('drag-over-main');
        e.dataTransfer.dropEffect = 'copy';
    }
}

function handleMainDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector('.image-wrapper').classList.remove('drag-over-main');
}

function handleMainDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const wrapper = document.querySelector('.image-wrapper');
    wrapper.classList.remove('drag-over-main');
    
    if (!wrapper.classList.contains('edit-mode')) return;
    
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        uploadMainImage(files[0]);
    }
}

// Separate function for Main Image upload logic to be reused
async function uploadMainImage(file) {
    if (!currentCharacter) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('character_name', currentCharacter.name);
    
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
            currentCharacter.image = data.image_url;
            // Update list
            const charInList = allCharacters.find(c => c.name === currentCharacter.name);
            if (charInList) charInList.image = data.image_url;
            
            // UI Update
            imgDisplay.src = getImageUrl(data.image_url);
            showToast('Main image updated!', 'success');
        } else {
            showToast(data.error || 'Failed to set main image', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error uploading main image', 'error');
    }
    
    imgDisplay.style.opacity = originalOpacity; // Will be reset by edit mode styles anyway but good practice
}

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
    
    // NOTE: Removed gallery-editing class as requested (no delete buttons)
    // document.getElementById('customImagesGallery').classList.add('gallery-editing');
    // loadCustomImages(currentCharacter.name); 
    
    // Main Image Visual Cues
    const imgWrapper = document.querySelector('.image-wrapper');
    imgWrapper.classList.add('edit-mode');
    
    // Attach DnD to Main Image
    imgWrapper.addEventListener('dragenter', handleMainDragEnter);
    imgWrapper.addEventListener('dragover', handleMainDragOver);
    imgWrapper.addEventListener('dragleave', handleMainDragLeave);
    imgWrapper.addEventListener('drop', handleMainDrop);
    
    // Allow clicking main image to change it
    const img = document.getElementById('charImageDisplay');
    img.style.cursor = 'pointer';
    img.onclick = () => document.getElementById('mainImageInput').click();
    img.title = "Click to replace main image";
    
    // Hide Save Button during edit to avoid confusion
    document.getElementById('saveButton').style.display = 'none';
}

function disableEditMode() {
    isEditing = false;
    document.getElementById('charDisplayMode').style.display = 'block';
    document.getElementById('charEditMode').style.display = 'none';
    // document.getElementById('customImagesGallery').classList.remove('gallery-editing');
    
    // Remove Main Image Visual Cues
    const imgWrapper = document.querySelector('.image-wrapper');
    imgWrapper.classList.remove('edit-mode');
    imgWrapper.classList.remove('drag-over-main');
    
    // Remove DnD
    imgWrapper.removeEventListener('dragenter', handleMainDragEnter);
    imgWrapper.removeEventListener('dragover', handleMainDragOver);
    imgWrapper.removeEventListener('dragleave', handleMainDragLeave);
    imgWrapper.removeEventListener('drop', handleMainDrop);
    
    document.getElementById('saveButton').style.display = 'block'; // Show save button again
    
    // Restore Main Image behavior
    const img = document.getElementById('charImageDisplay');
    if (currentCharacter.image) {
        img.onclick = () => openModal(0);
        img.title = currentCharacter.name;
    } else {
        img.onclick = () => document.getElementById('mainImageInput').click();
        img.title = "Click to upload main image";
    }
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
                // Direct hash update to keep same window
                window.location.hash = '#/character/' + encodeURIComponent(currentCharacter.name);
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

let draggedItem = null;
let selectedImages = new Set();

function toggleDeleteMode() {
    // If reordering is active, turn it off
    if (isReordering) toggleReorderMode();
    // If AI command mode is active, turn it off
    if (isAiCommand) toggleAiCommandMode();
    
    isDeleting = !isDeleting;
    const deleteBtn = document.getElementById('deleteModeBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const gallery = document.getElementById('customImagesGallery');
    const items = gallery.querySelectorAll('.gallery-item-wrapper');
    
    if (isDeleting) {
        // Switch Buttons
        deleteBtn.style.display = 'none';
        confirmBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'inline-flex';
        
        // Hide Add/Reorder/AI buttons
        document.getElementById('addCustomImageBtn').style.display = 'none';
        document.getElementById('reorderBtn').style.display = 'none';
        // Hide AI buttons if they are somehow visible (they shouldn't be due to check above)
        
        // Reset Selection
        selectedImages.clear();
        updateSelectionUI();
        
        // Add listeners
        items.forEach(item => {
            item.classList.add('delete-mode');
            item.addEventListener('click', handleImageSelect);
            // Disable lightbox click on img
            const img = item.querySelector('img');
            if (img) img.onclick = null; 
        });
        
    } else {
        // Switch Buttons
        deleteBtn.style.display = 'inline-flex';
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        
        // Show Add/Reorder buttons
        document.getElementById('addCustomImageBtn').style.display = 'inline-flex';
        document.getElementById('reorderBtn').style.display = 'inline-flex';
        
        // Clear Selection
        selectedImages.clear();
        items.forEach(item => {
            item.classList.remove('delete-mode');
            item.classList.remove('selected');
            item.removeEventListener('click', handleImageSelect);
            
            // Restore lightbox click
            const img = item.querySelector('img');
            // We need the index to restore lightbox properly. 
            // Luckily `loadCustomImages` sets the index in the onclick closure.
            // But we can't easily retrieve the index here.
            // Best strategy: Reload gallery to restore clean state.
        });
        
        // Reload to restore original onclick handlers
        loadCustomImages(currentCharacter.name);
    }
}

function handleImageSelect(e) {
    e.stopPropagation(); // Prevent anything else
    
    const item = this; // .gallery-item-wrapper
    const img = item.querySelector('img');
    if (!img) return;
    
    const url = img.src;
    
    if (selectedImages.has(url)) {
        selectedImages.delete(url);
        item.classList.remove('selected');
    } else {
        selectedImages.add(url);
        item.classList.add('selected');
    }
    
    updateSelectionUI();
}

function updateSelectionUI() {
    if (isDeleting) {
        const btn = document.getElementById('confirmDeleteBtn');
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px; vertical-align: text-bottom;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete Selected (${selectedImages.size})
        `;
        
        if (selectedImages.size === 0) {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    } else if (isAiCommand) {
        const btn = document.getElementById('copyAiCmdBtn');
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px; vertical-align: text-bottom;">
                 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Command (${selectedImages.size})
        `;
        
        if (selectedImages.size === 0) {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }
}

async function deleteSelectedImages() {
    if (selectedImages.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedImages.size} image(s)?`)) return;
    
    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';
    
    try {
        const res = await fetch('/api/delete-custom-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character_name: currentCharacter.name,
                image_urls: Array.from(selectedImages)
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showToast(data.message || 'Images deleted', 'success');
            // Exit delete mode and reload
            toggleDeleteMode(); 
        } else {
            showToast(data.error || 'Failed to delete images', 'error');
            btn.innerHTML = originalText;
        }
    } catch (e) {
        console.error(e);
        showToast('Error deleting images', 'error');
        btn.innerHTML = originalText;
    }
}

function toggleAiCommandMode() {
    // If reordering is active, turn it off
    if (isReordering) toggleReorderMode();
    // If delete mode is active, turn it off
    if (isDeleting) toggleDeleteMode();
    
    isAiCommand = !isAiCommand;
    const gallery = document.getElementById('customImagesGallery');
    const items = gallery.querySelectorAll('.gallery-item-wrapper');
    
    // Buttons
    const copyBtn = document.getElementById('copyAiCmdBtn');
    const selectAllBtn = document.getElementById('selectAllAiBtn');
    const cancelBtn = document.getElementById('cancelAiBtn');
    
    // Other main buttons
    const addBtn = document.getElementById('addCustomImageBtn');
    const reorderBtn = document.getElementById('reorderBtn');
    const deleteBtn = document.getElementById('deleteModeBtn');
    
    if (isAiCommand) {
        // Show AI controls
        copyBtn.style.display = 'inline-flex';
        selectAllBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'inline-flex';
        
        // Hide others
        addBtn.style.display = 'none';
        reorderBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        
        // Reset Selection
        selectedImages.clear();
        updateSelectionUI();
        
        // Enable Selection Mode
        items.forEach(item => {
            item.classList.add('ai-mode');
            item.addEventListener('click', handleImageSelect);
            
            // Disable lightbox click
            const img = item.querySelector('img');
            if (img) img.onclick = null;
        });
        
        // Scroll to gallery
        document.getElementById('customImagesSection').scrollIntoView({ behavior: 'smooth' });
        
    } else {
        // Hide AI controls
        copyBtn.style.display = 'none';
        selectAllBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        
        // Show others
        addBtn.style.display = 'inline-flex';
        reorderBtn.style.display = 'inline-flex';
        deleteBtn.style.display = 'inline-flex';
        
        // Clear Selection
        selectedImages.clear();
        items.forEach(item => {
            item.classList.remove('ai-mode');
            item.classList.remove('selected');
            item.removeEventListener('click', handleImageSelect);
        });
        
        // Restore Lightbox (Reload)
        loadCustomImages(currentCharacter.name);
    }
}

function selectAllImages() {
    const gallery = document.getElementById('customImagesGallery');
    const items = gallery.querySelectorAll('.gallery-item-wrapper');
    
    items.forEach(item => {
        const img = item.querySelector('img');
        if (img) {
            selectedImages.add(img.src);
            item.classList.add('selected');
        }
    });
    updateSelectionUI();
}

async function generateAiCommand() {
    if (selectedImages.size === 0) {
        showToast('Please select at least one image.', 'error');
        return;
    }
    
    // Format: $ai <name> $ <link> $ <link>
    const links = Array.from(selectedImages);
    let command = `$ai ${currentCharacter.name}`;
    
    links.forEach(link => {
        command += ` $ ${link}`;
    });
    
    try {
        await navigator.clipboard.writeText(command);
        showToast('Command copied to clipboard!', 'success');
        toggleAiCommandMode(); // Close mode
    } catch (err) {
        console.error('Failed to copy', err);
        showToast('Failed to copy command (Clipboard permission denied?)', 'error');
        // Fallback: Show in a prompt?
        // prompt("Copy this command:", command);
    }
}

function toggleReorderMode() {
    // If deleting is active, turn it off
    if (isDeleting) toggleDeleteMode();
    // If AI command mode is active, turn it off
    if (isAiCommand) toggleAiCommandMode();

    isReordering = !isReordering;
    const btn = document.getElementById('reorderBtn');
    const gallery = document.getElementById('customImagesGallery');
    const items = gallery.querySelectorAll('.gallery-item-wrapper');
    
    if (isReordering) {
        btn.innerHTML = 'Save Order';
        btn.style.backgroundColor = '#28a745';
        btn.style.color = 'white';
        btn.style.borderColor = '#28a745';
        
        // Disable Add/Delete Buttons
        document.getElementById('addCustomImageBtn').style.display = 'none';
        document.getElementById('deleteModeBtn').style.display = 'none';
        
        // Make items draggable
        items.forEach(item => {
            item.setAttribute('draggable', 'true');
            item.classList.add('draggable');
            addDragListeners(item);
        });
        
    } else {
        // Save
        saveReorder();
        
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px; vertical-align: text-bottom;">
                <polyline points="5 9 2 12 5 15"></polyline>
                <polyline points="9 5 12 2 15 5"></polyline>
                <polyline points="19 9 22 12 19 15"></polyline>
                <polyline points="9 19 12 22 15 19"></polyline>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
            </svg>
            Reorder
        `;
        btn.style.backgroundColor = ''; // Reset
        btn.style.color = '';
        btn.style.borderColor = '';
        
        // Enable Add/Delete Buttons
        document.getElementById('addCustomImageBtn').style.display = 'inline-flex';
        document.getElementById('deleteModeBtn').style.display = 'inline-flex';
        
        // Remove draggable
        items.forEach(item => {
            item.setAttribute('draggable', 'false');
            item.classList.remove('draggable');
            item.classList.remove('dragging'); // Ensure dragging class is removed
            removeDragListeners(item);
        });
        
        // Clear global drag state just in case
        draggedItem = null;
        document.getElementById('customImagesSection').classList.remove('drag-over');
    }
}

function addDragListeners(item) {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('dragend', handleDragEnd);
}

function removeDragListeners(item) {
    item.removeEventListener('dragstart', handleDragStart);
    item.removeEventListener('dragover', handleDragOver);
    item.removeEventListener('drop', handleDrop);
    item.removeEventListener('dragenter', handleDragEnter);
    item.removeEventListener('dragleave', handleDragLeave);
    item.removeEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
    // Ensure all clean
    document.querySelectorAll('.gallery-item-wrapper').forEach(el => el.classList.remove('dragging'));
    // Ensure container unhighlight
    document.getElementById('customImagesSection').classList.remove('drag-over');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (this === draggedItem) return;
    
    const gallery = document.getElementById('customImagesGallery');
    const items = [...gallery.querySelectorAll('.gallery-item-wrapper')];
    const draggedIdx = items.indexOf(draggedItem);
    const targetIdx = items.indexOf(this);
    
    // Swap in DOM
    if (draggedIdx < targetIdx) {
        this.after(draggedItem);
    } else {
        this.before(draggedItem);
    }
}

function handleDragEnter(e) {
    e.preventDefault();
}

function handleDragLeave(e) {
    // Optional styling cleanup
}

function handleDrop(e) {
    e.stopPropagation();
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    // Ensure container unhighlight
    document.getElementById('customImagesSection').classList.remove('drag-over');
    return false;
}

async function saveReorder() {
    if (!currentCharacter) return;
    
    const gallery = document.getElementById('customImagesGallery');
    const items = gallery.querySelectorAll('.gallery-item-wrapper img');
    const newOrder = Array.from(items).map(img => img.src);
    
    // Optimistic update of local cache?
    // We'll just let the server confirm, but we should update our cached `galleryImages` so subsequent clicks on images open correct index
    galleryImages = newOrder;
    
    try {
        const res = await fetch('/api/reorder-custom-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character_name: currentCharacter.name,
                new_order: newOrder
            })
        });
        
        if (res.ok) {
            showToast('Order saved!', 'success');
        } else {
            showToast('Failed to save order', 'error');
            loadCustomImages(currentCharacter.name); // Revert on fail
        }
    } catch (e) {
        console.error(e);
        showToast('Error saving order', 'error');
        loadCustomImages(currentCharacter.name); // Revert
    }
}

async function loadCustomImages(name) {
    const gallery = document.getElementById('customImagesGallery');
    if (!gallery) return;
    
    // Reset Reorder State on load/refresh
    if (isReordering) {
        // ... existing reset logic ...
        isReordering = false;
        // reset UI
        const btn = document.getElementById('reorderBtn');
        if(btn) {
             btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px; vertical-align: text-bottom;">
                    <polyline points="5 9 2 12 5 15"></polyline>
                    <polyline points="9 5 12 2 15 5"></polyline>
                    <polyline points="19 9 22 12 19 15"></polyline>
                    <polyline points="9 19 12 22 15 19"></polyline>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="12" y1="2" x2="12" y2="22"></line>
                </svg>
                Reorder
            `;
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.borderColor = '';
        }
    }
    
    // Reset Delete State
    if (isDeleting) {
        isDeleting = false;
        selectedImages.clear();
        
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');
        if (confirmBtn) confirmBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        const delBtn = document.getElementById('deleteModeBtn');
        if (delBtn) delBtn.style.display = 'inline-flex';
    }
    
    // Reset AI Command State
    if (isAiCommand) {
        isAiCommand = false;
        selectedImages.clear();
        
        const copyBtn = document.getElementById('copyAiCmdBtn');
        const selectAllBtn = document.getElementById('selectAllAiBtn');
        const cancelBtn = document.getElementById('cancelAiBtn');
        if (copyBtn) copyBtn.style.display = 'none';
        if (selectAllBtn) selectAllBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Ensure buttons visible are handled below
    }
    
    // Ensure buttons visible
    const addBtn = document.getElementById('addCustomImageBtn');
    if (addBtn) addBtn.style.display = 'inline-flex';
    const reorderBtn = document.getElementById('reorderBtn');
    if (reorderBtn) reorderBtn.style.display = 'inline-flex';
    const deleteBtn = document.getElementById('deleteModeBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    
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
                
                wrapper.appendChild(img);
                gallery.appendChild(wrapper);
            });
        }
        
        // Check if editing mode is active to show delete buttons
        if (isEditing) {
            // gallery.classList.add('gallery-editing');
        } else {
            // gallery.classList.remove('gallery-editing');
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

function updateAddImageLabel(input) {
    const label = document.getElementById('addCharImageLabel');
    if (input.files && input.files.length > 0) {
        label.textContent = input.files[0].name;
        label.style.color = '#28a745';
        label.style.fontWeight = 'bold';
    } else {
        label.textContent = 'Click to select image (can be added later)';
        label.style.color = '#6c757d';
        label.style.fontWeight = 'normal';
    }
}

async function handleAddCharacter(e) {
    e.preventDefault();
    const name = document.getElementById('addCharName').value.trim();
    const series = document.getElementById('addCharSeries').value.trim();
    const rank = document.getElementById('addCharRank').value.trim();
    const imageInput = document.getElementById('addCharImage');
    
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
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('series', series);
    formData.append('rank', rank);
    
    if (imageInput.files.length > 0) {
        formData.append('image', imageInput.files[0]);
    }
    
    try {
        const res = await fetch('/api/add-character', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (res.ok) {
            showAddCharStatus(`Added "${name}" successfully.`, 'success');
            document.getElementById('addCharForm').reset();
            updateAddImageLabel(imageInput); // Reset label
            
            // Reload to get fresh data including new image
            await loadCharacterData();
        } else {
            showAddCharStatus(data.error || 'Failed to add character.', 'error');
        }
    } catch (err) {
        console.error(err);
        showAddCharStatus('Could not reach server.', 'error');
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
        
        // Fetch Last Updated Timestamps
        let lastUpdatedMap = {};
        try {
            const timeRes = await fetch('/api/last-updated', { cache: 'no-cache' });
            if (timeRes.ok) {
                lastUpdatedMap = await timeRes.json();
            }
        } catch (e) {
            console.warn('Failed to load last_updated.json');
        }
        
        const names = Object.keys(customData);
        // Map names to their insertion index OR explicit timestamp
        const recencyMap = {};
        names.forEach((name, index) => {
            if (lastUpdatedMap[name]) {
                recencyMap[name] = lastUpdatedMap[name];
            } else {
                // Fallback for characters not yet updated with new system
                // Use index as a rough proxy (higher index = more recent in file)
                recencyMap[name] = index; 
            }
        });

        // Filter out empty arrays
        const activeNames = names.filter(n => customData[n] && customData[n].length > 0);
        
        // Enrich characters
        cachedCustoms = allCharacters
            .filter(c => activeNames.includes(c.name))
            .map(c => ({
                ...c,
                customImages: customData[c.name] || [],
                customCount: (customData[c.name] || []).length,
                recentIndex: recencyMap[c.name] || 0
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
        if (sortMode === 'recent') return b.recentIndex - a.recentIndex; // Newest first
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
         const item = document.createElement('a'); // Changed to <a>
         item.href = '#/character/' + encodeURIComponent(char.name); // Set href
         item.className = 'search-result-item';
         // item.onclick = () => navigateTo('/character', char); // Removed onclick
         
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