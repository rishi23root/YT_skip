/*
  Enhanced YouTube Transcript Skipper popup with user preferences
  Handles tab navigation, skip categories, custom keywords, and user preferences
*/

// Default categories that match the backend
const DEFAULT_CATEGORIES = {
  'advertisements': { name: 'Advertisements', desc: 'Sponsored content, ads, promotions' },
  'calls_to_action': { name: 'Calls to Action', desc: 'Subscribe, like, share prompts' },
  'political_content': { name: 'Political Content', desc: 'Political discussions, opinions' },
  'negative_content': { name: 'Negative Content', desc: 'Drama, controversies, rants' },
  'kids_content': { name: 'Kids Content', desc: 'Children-focused content, jokes' },
  'self_promotion': { name: 'Self Promotion', desc: 'Merch, courses, personal products' },
  'repetitive_content': { name: 'Repetitive Content', desc: 'Repeated explanations' },
  'filler_speech': { name: 'Filler Speech', desc: 'Um, uh, like, basically...' },
  'technical_jargon': { name: 'Technical Jargon', desc: 'Complex technical details' },
  'personal_stories': { name: 'Personal Stories', desc: 'Personal anecdotes, experiences' }
};

// Default preferences
const DEFAULT_PREFERENCES = {
  default_categories: [],
  custom_keywords: [],
  custom_phrases: [],
  sensitivity: 'medium',
  enabled: true
};

class PreferencesManager {
  constructor() {
    this.preferences = { ...DEFAULT_PREFERENCES };
    this.isSaving = false; // Add saving state tracking
    this.init();
  }

  async init() {
    await this.loadPreferences();
    this.setupEventListeners();
    this.renderCategories();
    this.renderCustomTags();
    this.updateUI();
  }

  async loadPreferences() {
    try {
      const result = await chrome.storage.local.get(['userPreferences', 'skipperEnabled']);
      this.preferences = { ...DEFAULT_PREFERENCES, ...(result.userPreferences || {}) };

      // Ensure arrays exist and are valid
      if (!Array.isArray(this.preferences.custom_keywords)) {
        this.preferences.custom_keywords = [];
      }
      if (!Array.isArray(this.preferences.custom_phrases)) {
        this.preferences.custom_phrases = [];
      }
      if (!Array.isArray(this.preferences.default_categories)) {
        this.preferences.default_categories = [];
      }

      // Update main toggle
      const toggle = document.getElementById('skipperToggle');
      const skipperEnabled = result.skipperEnabled !== undefined ? result.skipperEnabled : true;
      toggle.checked = skipperEnabled;
      this.updateStatus(skipperEnabled);

      console.log('Loaded preferences:', this.preferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
      this.showNotification('Error loading preferences', 'error');
    }
  }

  async savePreferences(showNotification = true) {
    if (this.isSaving) return; // Prevent concurrent saves

    this.isSaving = true;

    try {
      // Show saving indicator
      if (showNotification) {
        this.showNotification('Saving preferences...', 'info', 1000);
      }

      await chrome.storage.local.set({ userPreferences: this.preferences });

      console.log('Saved preferences:', this.preferences);

      if (showNotification) {
        this.showNotification('Preferences saved successfully!', 'success');
      }

      this.updateUI();
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.showNotification('Error saving preferences', 'error');
    } finally {
      this.isSaving = false;
    }
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Main toggle
    const toggleSwitch = document.getElementById('skipperToggle');
    toggleSwitch.addEventListener('change', async (e) => {
      const isEnabled = e.target.checked;
      await chrome.storage.local.set({ skipperEnabled: isEnabled });
      this.updateStatus(isEnabled);

      // Send message to content script
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url.includes('youtube.com/watch')) {
          if (isEnabled) {
            chrome.tabs.sendMessage(tab.id, { action: 'processVideo' });
          } else {
            chrome.tabs.sendMessage(tab.id, { action: 'disable' });
          }
        }
      } catch (error) {
        console.error('Error sending message to content script:', error);
      }
    });

    // Custom keywords
    const keywordInput = document.getElementById('customKeywordInput');
    const addKeywordBtn = document.getElementById('addKeywordBtn');

    keywordInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        await this.addCustomKeyword();
      }
    });

    addKeywordBtn.addEventListener('click', async () => {
      await this.addCustomKeyword();
    });

    // Custom phrases
    const phraseInput = document.getElementById('customPhraseInput');
    const addPhraseBtn = document.getElementById('addPhraseBtn');

    phraseInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        await this.addCustomPhrase();
      }
    });

    addPhraseBtn.addEventListener('click', async () => {
      await this.addCustomPhrase();
    });

    // Sensitivity radio buttons - auto-save on change
    document.querySelectorAll('input[name="sensitivity"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        this.preferences.sensitivity = e.target.value;
        // Auto-save after sensitivity change
        await this.savePreferences(false);
      });
    });

    // Action buttons
    document.getElementById('savePreferencesBtn').addEventListener('click', async () => {
      await this.savePreferences();
    });

    document.getElementById('resetPreferencesBtn').addEventListener('click', async () => {
      await this.resetPreferences();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }

  renderCategories() {
    const grid = document.getElementById('categoriesGrid');
    grid.innerHTML = '';

    Object.entries(DEFAULT_CATEGORIES).forEach(([categoryId, categoryData]) => {
      const categoryElement = document.createElement('div');
      categoryElement.className = 'category-option';
      categoryElement.dataset.category = categoryId;

      if (this.preferences.default_categories.includes(categoryId)) {
        categoryElement.classList.add('selected');
      }

      categoryElement.innerHTML = `
        <span class="category-name">${categoryData.name}</span>
        <span class="category-desc">${categoryData.desc}</span>
      `;

      categoryElement.addEventListener('click', () => {
        this.toggleCategory(categoryId, categoryElement);
      });

      grid.appendChild(categoryElement);
    });
  }

  toggleCategory(categoryId, element) {
    const index = this.preferences.default_categories.indexOf(categoryId);

    if (index === -1) {
      // Add category
      this.preferences.default_categories.push(categoryId);
      element.classList.add('selected');
    } else {
      // Remove category
      this.preferences.default_categories.splice(index, 1);
      element.classList.remove('selected');
    }

    // Auto-save after category change
    this.savePreferences(false);
  }

  async addCustomKeyword() {
    const input = document.getElementById('customKeywordInput');
    const keyword = input.value.trim();

    if (!keyword) {
      this.showNotification('Please enter a keyword', 'error');
      return;
    }

    if (this.preferences.custom_keywords.includes(keyword)) {
      this.showNotification('Keyword already exists', 'error');
      return;
    }

    this.preferences.custom_keywords.push(keyword);
    input.value = '';
    this.renderCustomTags();

    // Auto-save after adding keyword
    await this.savePreferences();
  }

  async addCustomPhrase() {
    const input = document.getElementById('customPhraseInput');
    const phrase = input.value.trim();

    if (!phrase) {
      this.showNotification('Please enter a phrase', 'error');
      return;
    }

    if (this.preferences.custom_phrases.includes(phrase)) {
      this.showNotification('Phrase already exists', 'error');
      return;
    }

    this.preferences.custom_phrases.push(phrase);
    input.value = '';
    this.renderCustomTags();

    // Auto-save after adding phrase
    await this.savePreferences();
  }

  async removeCustomKeyword(keyword) {
    const index = this.preferences.custom_keywords.indexOf(keyword);
    if (index > -1) {
      this.preferences.custom_keywords.splice(index, 1);
      this.renderCustomTags();

      // Auto-save after removing keyword
      await this.savePreferences();
    }
  }

  async removeCustomPhrase(phrase) {
    const index = this.preferences.custom_phrases.indexOf(phrase);
    if (index > -1) {
      this.preferences.custom_phrases.splice(index, 1);
      this.renderCustomTags();

      // Auto-save after removing phrase
      await this.savePreferences();
    }
  }

  renderCustomTags() {
    // Render custom keywords
    const keywordsContainer = document.getElementById('customKeywords');
    if (!keywordsContainer) {
      console.warn('customKeywords container not found, skipping render');
      return;
    }

    keywordsContainer.innerHTML = '';

    this.preferences.custom_keywords.forEach(keyword => {
      const tag = document.createElement('div');
      tag.className = 'custom-tag';
      tag.innerHTML = `
        <span>${keyword}</span>
        <button class="remove-tag" data-keyword="${keyword}">×</button>
      `;

      tag.querySelector('.remove-tag').addEventListener('click', async () => {
        await this.removeCustomKeyword(keyword);
      });

      keywordsContainer.appendChild(tag);
    });

    // Render custom phrases
    const phrasesContainer = document.getElementById('customPhrases');
    if (!phrasesContainer) {
      console.warn('customPhrases container not found, skipping render');
      return;
    }

    phrasesContainer.innerHTML = '';

    this.preferences.custom_phrases.forEach(phrase => {
      const tag = document.createElement('div');
      tag.className = 'custom-tag';
      tag.innerHTML = `
        <span>${phrase}</span>
        <button class="remove-tag" data-phrase="${phrase}">×</button>
      `;

      tag.querySelector('.remove-tag').addEventListener('click', async () => {
        await this.removeCustomPhrase(phrase);
      });

      phrasesContainer.appendChild(tag);
    });

    this.updateUI();
  }

  updateUI() {
    // Update sensitivity radio buttons
    document.querySelector(`input[name="sensitivity"][value="${this.preferences.sensitivity}"]`).checked = true;

    // Update quick stats
    const activeCategoriesCount = this.preferences.default_categories.length;
    const customTermsCount = this.preferences.custom_keywords.length + this.preferences.custom_phrases.length;

    document.getElementById('activeCategoriesCount').textContent = activeCategoriesCount;
    document.getElementById('customTermsCount').textContent = customTermsCount;

    // Show/hide quick stats
    const quickStats = document.getElementById('quickStats');
    if (activeCategoriesCount > 0 || customTermsCount > 0) {
      quickStats.style.display = 'flex';
    } else {
      quickStats.style.display = 'none';
    }
  }

  async resetPreferences() {
    if (confirm('Are you sure you want to reset all preferences to defaults?')) {
      this.preferences = { ...DEFAULT_PREFERENCES };
      this.renderCategories();
      this.renderCustomTags();
      this.updateUI();

      // Auto-save after reset
      await this.savePreferences();
      this.showNotification('Preferences reset to defaults', 'info');
    }
  }

  updateStatus(enabled) {
    const statusText = document.getElementById('status');
    statusText.textContent = enabled ? 'Skipper is active' : 'Skipper is disabled';
  }

  showNotification(message, type = 'info', duration = 3000) {
    // Remove existing notification
    const existingNotification = document.querySelector('.popup-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = 'popup-notification';
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 12px;
      font-weight: 500;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, duration);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PreferencesManager();
});
