// Session Management Utility
// This file handles user sessions, role verification, and portal access control

class SessionManager {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.sessionTimer = null;
  }

  // Initialize session manager
  async init() {
    // Check if user is already logged in
    const user = this.getCurrentUser();
    if (user) {
      await this.validateSession(user);
    }
    
    // Set up session timeout
    this.setupSessionTimeout();
  }

  // Get current user from tab-scoped session storage.
  getCurrentUser() {
    const userData = sessionStorage.getItem('currentUser');
    if (userData) {
      try {
        return JSON.parse(userData);
      } catch (e) {
        console.error('Error parsing user data:', e);
        return null;
      }
    }
    return null;
  }

  // Set current user in session
  setCurrentUser(user, role) {
    this.currentUser = user;
    this.userRole = role;
    
    const userData = {
      uid: user.uid,
      email: user.email,
      role: role,
      loginTime: Date.now()
    };
    
    sessionStorage.setItem('currentUser', JSON.stringify(userData));
    this.setupSessionTimeout();
  }

  // Validate user session
  async validateSession(user) {
    try {
      // Check if user document exists and role matches
      const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
      const { app } = await import('./firebase-init.js');
      
      const db = getFirestore(app);
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        this.userRole = userData.role;
        return true;
      } else {
        this.clearSession();
        return false;
      }
    } catch (error) {
      console.error('Session validation error:', error);
      this.clearSession();
      return false;
    }
  }

  // Check if user has required role
  hasRole(requiredRole) {
    return this.userRole === requiredRole;
  }

  // Check if user has any of the required roles
  hasAnyRole(requiredRoles) {
    return requiredRoles.includes(this.userRole);
  }

  // Get current user role
  getCurrentRole() {
    return this.userRole;
  }

  // Setup session timeout
  setupSessionTimeout() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
    
    this.sessionTimer = setTimeout(() => {
      console.log('Session expired');
      this.clearSession();
      window.location.href = '../common/login.html';
    }, this.sessionTimeout);
  }

  // Extend session
  extendSession() {
    if (this.currentUser) {
      this.setupSessionTimeout();
    }
  }

  // Clear session
  clearSession() {
    this.currentUser = null;
    this.userRole = null;
    sessionStorage.removeItem('currentUser');
    
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  // Redirect to appropriate portal based on role
  redirectToPortal() {
    if (!this.userRole) {
      window.location.href = '../common/login.html';
      return;
    }

    const portalUrls = {
      'admin': '../admin/index.html',
      'teacher': '../teacher/index.html',
      'parent': '../parent/index.html',
      'driver': '../driver/index.html'
    };

    const portalUrl = portalUrls[this.userRole];
    if (portalUrl) {
      window.location.href = portalUrl;
    } else {
      console.error('Unknown role:', this.userRole);
      window.location.href = '../common/unauthorized.html';
    }
  }

  // Check portal access permission
  checkPortalAccess(requiredRole) {
    if (!this.hasRole(requiredRole)) {
      console.log('Access denied: User role', this.userRole, 'does not match required role', requiredRole);
      window.location.href = '../common/unauthorized.html';
      return false;
    }
    return true;
  }

  // Logout user
  async logout() {
    try {
      const { logout } = await import('./auth.js');
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearSession();
      window.location.href = '../common/login.html';
    }
  }
}

// Create global session manager instance
const sessionManager = new SessionManager();

// Export for use in other modules
export default sessionManager;

// Make available globally for debugging
window.sessionManager = sessionManager;
