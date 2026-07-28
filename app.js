/* ==========================================================================
   PulseRed Supabase Client Integration
   ========================================================================== */

// 1. SUPABASE CONFIGURATION - REPLACE WITH YOUR PROJECT CREDENTIALS
const SUPABASE_URL = 'https://jdutglctiizcxxmuuijq.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_cV9FsuqL8Dq1BkrqJkSwhQ_L2ckO8fA';

let supabaseClient = null;

// Safe check for Supabase CDN global object to prevent crashes
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
  try {
    const { createClient } = window.supabase || {};
    if (createClient) {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error("PulseRed: Supabase library not found. Verify CDN script tag in HTML.");
    }
  } catch (err) {
    console.error("PulseRed: Failed to initialize Supabase client.", err);
  }
} else {
  console.warn("PulseRed: Supabase URL and Anon Key are not set. Database integration will be disabled.");
}

// Global user profile state
let currentUserProfile = null;

// Compatibility maps
const DONATE_COMPATIBILITY = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+']
};

const RECEIVE_COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
};

// ==========================================================================
// INITIALIZATION & AUTH STATE HANDLERS
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Determine page type
  const isDashboard = window.location.pathname.includes('dashboard.html');
  
  if (!supabaseClient) {
    if (isDashboard) {
      document.getElementById('dashboard-loader').innerHTML = `
        <i class="fa-solid fa-triangle-exclamation loader-icon" style="color:var(--warning-orange)"></i>
        <h3>Supabase Credentials Missing</h3>
        <p>Please open <code>app.js</code> and configure your <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>.</p>
      `;
    } else {
      loadPublicRequests(); // Fallback dummy loading on index
    }
    return;
  }

  // Monitor auth state changes
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      // Get profile
      currentUserProfile = await fetchProfile(session.user.id);
      
      if (!isDashboard) {
        // Logged in user on landing page should redirect to dashboard
        window.location.href = 'dashboard.html';
      } else {
        // Update dashboard details
        setupDashboardUI();
      }
    } else {
      currentUserProfile = null;
      if (isDashboard) {
        // Unauthorized dashboard user redirects to landing
        window.location.href = 'index.html';
      } else {
        loadPublicRequests();
      }
    }
  });
});

// Fetch Profile from public.profiles
async function fetchProfile(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

// ==========================================================================
// LANDING PAGE FUNCTIONALITY
// ==========================================================================
async function loadPublicRequests() {
  const gridElement = document.getElementById('requests-grid');
  if (!gridElement) return;

  const bloodFilter = document.getElementById('blood-filter').value;

  // Render dummy data if Supabase is not configured yet
  if (!supabaseClient) {
    renderDummyPublicRequests(gridElement, bloodFilter);
    return;
  }

  try {
    let query = supabaseClient
      .from('blood_requests')
      .select(`
        id,
        blood_type,
        units_needed,
        hospital_name,
        location,
        urgency,
        status,
        created_at,
        profiles!blood_requests_requester_id_fkey (full_name)
      `)
      .eq('status', 'Pending')
      .order('created_at', { ascending: false });

    if (bloodFilter !== 'ALL') {
      query = query.eq('blood_type', bloodFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data.length === 0) {
      gridElement.innerHTML = `<p class="empty-placeholder">No active requests for this filter. Excellent!</p>`;
      return;
    }

    gridElement.innerHTML = '';
    data.forEach(req => {
      const formattedDate = new Date(req.created_at).toLocaleDateString();
      const card = document.createElement('div');
      card.className = 'request-card';
      card.innerHTML = `
        <div class="request-card-header">
          <div class="request-blood-badge">${req.blood_type}</div>
          <span class="urgency-badge urgency-${req.urgency}">${req.urgency}</span>
        </div>
        <div class="request-card-body">
          <h4>${req.hospital_name}</h4>
          <div class="request-meta-item"><i class="fa-solid fa-cubes"></i> Needed: <strong>${req.units_needed} unit(s)</strong></div>
          <div class="request-meta-item"><i class="fa-solid fa-location-dot"></i> ${req.location}</div>
          <div class="request-meta-item"><i class="fa-solid fa-calendar"></i> Broadcasted: ${formattedDate}</div>
        </div>
        <div class="request-card-footer">
          <button class="btn-primary btn-block btn-sm" onclick="openAuthModal('login')">Login to Donate</button>
        </div>
      `;
      gridElement.appendChild(card);
    });

  } catch (error) {
    console.error("Error loading requests:", error);
    gridElement.innerHTML = `<p class="empty-placeholder text-red">Failed to connect to database.</p>`;
  }
}

// Fallback dummy rendering
function renderDummyPublicRequests(gridElement, filter) {
  const dummy = [
    { id: '1', blood_type: 'O-', units_needed: 2, hospital_name: 'Metro General Hospital', location: 'New York, NY', urgency: 'Critical', status: 'Pending', created_at: new Date() },
    { id: '2', blood_type: 'A+', units_needed: 4, hospital_name: 'St. Jude Medical Center', location: 'Brooklyn, NY', urgency: 'High', status: 'Pending', created_at: new Date() },
    { id: '3', blood_type: 'B-', units_needed: 1, hospital_name: 'Children Mercy Clinic', location: 'Queens, NY', urgency: 'Medium', status: 'Pending', created_at: new Date() }
  ];

  gridElement.innerHTML = '';
  const filtered = filter === 'ALL' ? dummy : dummy.filter(d => d.blood_type === filter);

  if (filtered.length === 0) {
    gridElement.innerHTML = `<p class="empty-placeholder">No active requests for this filter. Excellent!</p>`;
    return;
  }

  filtered.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="request-card-header">
        <div class="request-blood-badge">${req.blood_type}</div>
        <span class="urgency-badge urgency-${req.urgency}">${req.urgency}</span>
      </div>
      <div class="request-card-body">
        <h4>${req.hospital_name}</h4>
        <div class="request-meta-item"><i class="fa-solid fa-cubes"></i> Needed: <strong>${req.units_needed} unit(s)</strong></div>
        <div class="request-meta-item"><i class="fa-solid fa-location-dot"></i> ${req.location}</div>
        <div class="request-meta-item"><i class="fa-solid fa-calendar"></i> Broadcasted: Just Now</div>
      </div>
      <div class="request-card-footer">
        <button class="btn-primary btn-block btn-sm" onclick="openAuthModal('login')">Login to Donate</button>
      </div>
    `;
    gridElement.appendChild(card);
  });
}

// ==========================================================================
// MODAL & AUTH TAB TOGGLES
// ==========================================================================
function openAuthModal(mode, defaultRole = 'donor') {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('active');
  switchAuthTab(mode);
  
  if (defaultRole) {
    document.getElementById('signup-role').value = defaultRole;
  }
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const formLogin = document.getElementById('login-form');
  const formSignup = document.getElementById('signup-form');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    formLogin.classList.remove('hidden');
    formSignup.classList.add('hidden');
  } else {
    tabLogin.classList.remove('active');
    tabSignup.classList.add('active');
    formLogin.classList.add('hidden');
    formSignup.classList.remove('hidden');
  }
}

function toggleSignupFields() {
  const role = document.getElementById('signup-role').value;
  const bloodInputGroup = document.getElementById('signup-blood').closest('.input-group');
}

// ==========================================================================
// AUTH SIGN UP & LOGIN SUBMISSIONS
// ==========================================================================
async function handleSignup(event) {
  event.preventDefault();
  if (!supabaseClient) return alert("Please set Supabase URL and Anon Key in app.js first!");

  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const name = document.getElementById('signup-name').value;
  const phone = document.getElementById('signup-phone').value;
  const location = document.getElementById('signup-location').value;
  const role = document.getElementById('signup-role').value;
  const bloodType = document.getElementById('signup-blood').value;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: role,
          blood_type: bloodType,
          location: location,
          contact_number: phone,
          is_available: true
        }
      }
    });

    if (error) throw error;
    
    alert("Account registered successfully! Please log in.");
    closeAuthModal();
    switchAuthTab('login');
  } catch (error) {
    alert("Signup Error: " + error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabaseClient) return alert("Please set Supabase URL and Anon Key in app.js first!");

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    closeAuthModal();
    window.location.href = 'dashboard.html';
  } catch (error) {
    alert("Login Error: " + error.message);
  }
}

async function handleLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  window.location.href = 'index.html';
}

// ==========================================================================
// DASHBOARD UI HANDLERS & FETCHERS
// ==========================================================================
async function setupDashboardUI() {
  if (!currentUserProfile) return;

  // Set Profile Name and Badges
  document.getElementById('profile-name').textContent = currentUserProfile.full_name;
  document.getElementById('profile-role-badge').textContent = currentUserProfile.role;
  document.getElementById('user-avatar-tag').textContent = currentUserProfile.full_name[0].toUpperCase();

  // Hide loader
  document.getElementById('dashboard-loader').classList.add('hidden');

  // Load correct panel
  const panelDonor = document.getElementById('panel-donor');
  const panelRecipient = document.getElementById('panel-recipient');
  const panelAdmin = document.getElementById('panel-admin');

  panelDonor.classList.add('hidden');
  panelRecipient.classList.add('hidden');
  panelAdmin.classList.add('hidden');

  if (currentUserProfile.role === 'donor') {
    panelDonor.classList.remove('hidden');
    // Load donor data
    document.getElementById('donor-blood-type').textContent = currentUserProfile.blood_type;
    document.getElementById('donor-profile-name').textContent = currentUserProfile.full_name;
    document.getElementById('donor-profile-location').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${currentUserProfile.location || 'Not Specified'}`;
    
    const toggle = document.getElementById('donor-availability-toggle');
    toggle.checked = currentUserProfile.is_available;
    document.getElementById('availability-text').textContent = currentUserProfile.is_available 
      ? "You are active in matching queue." 
      : "You are marked as unavailable for matches.";

    loadDonorMatches();
    loadDonorHistory();
  } 
  else if (currentUserProfile.role === 'recipient') {
    panelRecipient.classList.remove('hidden');
    loadRecipientRequests();
  } 
  else if (currentUserProfile.role === 'admin') {
    panelAdmin.classList.remove('hidden');
    loadAdminData();
  }
}

// ==========================================================================
// DONOR DASHBOARD LOGIC
// ==========================================================================
async function toggleDonorAvailability(isChecked) {
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ is_available: isChecked })
      .eq('id', currentUserProfile.id);

    if (error) throw error;
    currentUserProfile.is_available = isChecked;
    document.getElementById('availability-text').textContent = isChecked 
      ? "You are active in matching queue." 
      : "You are marked as unavailable.";
  } catch (error) {
    console.error(error);
  }
}

async function loadDonorMatches() {
  const container = document.getElementById('donor-matches');
  if (!container) return;

  try {
    // Fetch all active pending requests
    const { data, error } = await supabaseClient
      .from('blood_requests')
      .select('*')
      .eq('status', 'Pending');
    
    if (error) throw error;

    // Filter compatibility client-side using our helper map
    const myBlood = currentUserProfile.blood_type;
    const compatibleRecipientTypes = DONATE_COMPATIBILITY[myBlood] || [];
    const matches = data.filter(req => compatibleRecipientTypes.includes(req.blood_type));

    if (matches.length === 0) {
      container.innerHTML = `<p class="empty-placeholder">No matching patient requests for your blood type (${myBlood}) currently.</p>`;
      return;
    }

    container.innerHTML = '';
    matches.forEach(match => {
      const div = document.createElement('div');
      div.className = 'match-item';
      div.innerHTML = `
        <div class="match-details">
          <h5>Hospital: ${match.hospital_name} (${match.blood_type} Needed)</h5>
          <p><i class="fa-solid fa-location-dot"></i> Address: ${match.location} | Urgency: <strong>${match.urgency}</strong></p>
          <p><i class="fa-solid fa-boxes-stacked"></i> Units Required: ${match.units_needed}</p>
        </div>
        <div>
          <span class="urgency-badge urgency-${match.urgency}">Compatible</span>
        </div>
      `;
      container.appendChild(div);
    });

  } catch (error) {
    console.error(error);
  }
}

async function submitDonationLog(event) {
  event.preventDefault();
  const units = parseInt(document.getElementById('donated-units').value);
  const date = document.getElementById('donation-date').value;

  try {
    const { error } = await supabaseClient
      .from('donations_log')
      .insert({
        donor_id: currentUserProfile.id,
        units_donated: units,
        donation_date: date
      });

    if (error) throw error;
    alert("Donation report submitted! Admin will verify and approve points shortly.");
    document.getElementById('donation-log-form').reset();
    loadDonorHistory();
  } catch (error) {
    alert("Error logging donation: " + error.message);
  }
}

async function loadDonorHistory() {
  const tbody = document.getElementById('donor-history-rows');
  if (!tbody) return;

  try {
    const { data, error } = await supabaseClient
      .from('donations_log')
      .select('*')
      .eq('donor_id', currentUserProfile.id)
      .order('donation_date', { ascending: false });

    if (error) throw error;

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-placeholder">No donation records logged.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(row.donation_date).toLocaleDateString()}</td>
        <td>${row.units_donated} Unit(s)</td>
        <td><span class="badge-status badge-${row.status.replace(' ', '')}">${row.status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
  }
}

// ==========================================================================
// RECIPIENT DASHBOARD LOGIC
// ==========================================================================
async function submitBloodRequest(event) {
  event.preventDefault();
  const type = document.getElementById('req-blood-type').value;
  const units = parseInt(document.getElementById('req-units').value);
  const hospital = document.getElementById('req-hospital').value;
  const location = document.getElementById('req-location').value;
  const urgency = document.getElementById('req-urgency').value;

  try {
    const { error } = await supabaseClient
      .from('blood_requests')
      .insert({
        requester_id: currentUserProfile.id,
        blood_type: type,
        units_needed: units,
        hospital_name: hospital,
        location: location,
        urgency: urgency
      });

    if (error) throw error;
    alert("Request published successfully onto live boards!");
    document.getElementById('blood-request-form').reset();
    loadRecipientRequests();
  } catch (error) {
    alert("Error publishing request: " + error.message);
  }
}

async function loadRecipientRequests() {
  const container = document.getElementById('recipient-requests');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('blood_requests')
      .select('*')
      .eq('requester_id', currentUserProfile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data.length === 0) {
      container.innerHTML = `<p class="empty-placeholder">You have no active or previous blood requests.</p>`;
      return;
    }

    container.innerHTML = '';
    data.forEach(req => {
      const div = document.createElement('div');
      div.className = 'match-item';
      div.style.borderLeftColor = req.status === 'Fulfilled' ? 'var(--success-green)' : 'var(--primary-red)';
      
      let actionsHTML = '';
      if (req.status === 'Pending') {
        actionsHTML = `
          <button class="btn-primary btn-sm" style="background:var(--success-green); box-shadow:none; padding: 6px 12px; margin-right: 5px;" onclick="updateRequestStatus('${req.id}', 'Fulfilled')">Mark Fulfilled</button>
          <button class="btn-secondary btn-sm" style="padding: 6px 12px; border-color:#cbd5e0; color:#4a5568;" onclick="updateRequestStatus('${req.id}', 'Cancelled')">Cancel</button>
        `;
      } else {
        actionsHTML = `<span class="badge-status badge-${req.status}">${req.status}</span>`;
      }

      div.innerHTML = `
        <div class="match-details">
          <h5>${req.hospital_name} (${req.blood_type} Required)</h5>
          <p><i class="fa-solid fa-cubes"></i> Units: ${req.units_needed} | Urgency: <strong>${req.urgency}</strong></p>
          <p><i class="fa-solid fa-location-dot"></i> Address: ${req.location}</p>
        </div>
        <div style="display:flex; align-items:center;">
          ${actionsHTML}
        </div>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error(error);
  }
}

async function updateRequestStatus(id, newStatus) {
  try {
    const { error } = await supabaseClient
      .from('blood_requests')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    loadRecipientRequests();
  } catch (error) {
    alert("Error updating request status: " + error.message);
  }
}

// ==========================================================================
// ADMIN DASHBOARD LOGIC
// ==========================================================================
async function loadAdminData() {
  const queueTbody = document.getElementById('admin-queue-rows');
  const reqDropdown = document.getElementById('admin-select-request');

  try {
    // 1. Fetch counts
    const { count: pendingLogsCount } = await supabaseClient
      .from('donations_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending Verification');
    
    const { count: activeReqCount } = await supabaseClient
      .from('blood_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending');
    
    const { count: donorProfilesCount } = await supabaseClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'donor');

    document.getElementById('admin-pending-count').textContent = pendingLogsCount || 0;
    document.getElementById('admin-active-requests').textContent = activeReqCount || 0;
    document.getElementById('admin-donors-count').textContent = donorProfilesCount || 0;

    // 2. Fetch pending logs with donor names
    const { data: logs, error: logsError } = await supabaseClient
      .from('donations_log')
      .select(`
        id,
        units_donated,
        donation_date,
        profiles (id, full_name)
      `)
      .eq('status', 'Pending Verification')
      .order('donation_date', { ascending: true });

    if (logsError) throw logsError;

    if (logs.length === 0) {
      queueTbody.innerHTML = `<tr><td colspan="4" class="empty-placeholder">All donation verifications clear!</td></tr>`;
    } else {
      queueTbody.innerHTML = '';
      logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${log.profiles.full_name}</strong></td>
          <td>${new Date(log.donation_date).toLocaleDateString()}</td>
          <td>${log.units_donated} Unit(s)</td>
          <td>
            <button onclick="resolveDonationLog('${log.id}', 'Approved', '${log.profiles.id}')" class="btn-primary" style="padding:4px 10px; font-size:12px; background:var(--success-green); box-shadow:none;">Approve</button>
            <button onclick="resolveDonationLog('${log.id}', 'Rejected', '${log.profiles.id}')" class="btn-secondary" style="padding:4px 10px; font-size:12px;">Reject</button>
          </td>
        `;
        queueTbody.appendChild(tr);
      });
    }

    // 3. Fill Active Request Dropdown in Matching Engine
    const { data: activeRequests, error: reqError } = await supabaseClient
      .from('blood_requests')
      .select('*')
      .eq('status', 'Pending');
    
    if (reqError) throw reqError;

    reqDropdown.innerHTML = '<option value="">-- Select request to calculate matches --</option>';
    activeRequests.forEach(req => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify(req);
      opt.textContent = `${req.hospital_name} (${req.blood_type} Urgency: ${req.urgency})`;
      reqDropdown.appendChild(opt);
    });

  } catch (error) {
    console.error(error);
  }
}

async function resolveDonationLog(logId, resolution, donorId) {
  try {
    // Update Donation Log Status
    const { error: logError } = await supabaseClient
      .from('donations_log')
      .update({ status: resolution })
      .eq('id', logId);
    
    if (logError) throw logError;

    // If approved, update donor's profile setting last donation date
    if (resolution === 'Approved') {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({ last_donation_date: new Date().toISOString().split('T')[0] })
        .eq('id', donorId);
      
      if (profileError) throw profileError;
    }

    alert(`Donation log set to: ${resolution}`);
    loadAdminData();
  } catch (error) {
    alert("Error updating donation log: " + error.message);
  }
}

async function runMatchEngine(requestString) {
  const container = document.getElementById('engine-matches');
  if (!requestString) {
    container.innerHTML = '<p class="empty-placeholder">Select a request above to trigger calculations.</p>';
    return;
  }

  const request = JSON.parse(requestString);
  const targetBloodType = request.blood_type;

  try {
    // 1. Fetch available donors
    const { data: profiles, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('role', 'donor')
      .eq('is_available', true);
    
    if (error) throw error;

    // 2. Filter available donors based on compatibility (who can donor donate to)
    const compatibleDonorTypes = RECEIVE_COMPATIBILITY[targetBloodType] || [];
    const compatibleDonors = profiles.filter(p => compatibleDonorTypes.includes(p.blood_type));

    if (compatibleDonors.length === 0) {
      container.innerHTML = `<p class="empty-placeholder">No active compatible donors found in region for ${targetBloodType}.</p>`;
      return;
    }

    container.innerHTML = '';
    compatibleDonors.forEach(donor => {
      const div = document.createElement('div');
      div.className = 'match-item';
      div.style.borderLeftColor = 'var(--success-green)';
      div.innerHTML = `
        <div class="match-details">
          <h5>${donor.full_name} (${donor.blood_type})</h5>
          <p><i class="fa-solid fa-location-dot"></i> Location: ${donor.location || 'N/A'}</p>
          <p><i class="fa-solid fa-phone"></i> Contact: <strong>${donor.contact_number || 'N/A'}</strong></p>
        </div>
        <div>
          <a href="tel:${donor.contact_number}" class="btn-primary" style="padding:6px 12px; font-size:12px;">Call Donor</a>
        </div>
      `;
      container.appendChild(div);
    });

  } catch (error) {
    console.error(error);
  }
}
