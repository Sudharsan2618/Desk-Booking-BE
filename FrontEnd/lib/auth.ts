export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  try {
    const response = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    console.log("Login API response status:", response.status);
    const data = await response.json();
    console.log("Login API response data:", data);

    if (!response.ok) {
      console.error("Login failed:", response.statusText);
      return null;
    }

    // Ensure user object and its id/email are present
    if (!data.user || !data.user.id || !data.user.email) {
      console.error("Login response missing user object or its ID/email:", data);
      return null;
    }
    const userName = data.user.first_name && data.user.last_name ? `${data.user.first_name} ${data.user.last_name}` : data.user.email; // Fallback to email if name parts are missing

    return { id: data.user.id, email: data.user.email, name: userName, phone: data.user.phone || null };
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

export async function registerUser(userData: { email: string; password: string; first_name: string; last_name: string; phone?: string; }): Promise<User | null> {
  try {
    const response = await fetch("http://localhost:5000/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      console.error("Signup failed:", response.statusText);
      return null;
    }

    const data = await response.json();
    // Ensure user object and its id/email are present
    if (!data.user || !data.user.id || !data.user.email) {
      console.error("Signup response missing user object or its ID/email:", data);
      return null;
    }
    const newUserName = data.user.first_name && data.user.last_name ? `${data.user.first_name} ${data.user.last_name}` : data.user.email; // Fallback to email if name parts are missing

    return { id: data.user.id, email: data.user.email, name: newUserName, phone: data.user.phone || null };
  } catch (error) {
    console.error("Registration error:", error);
    return null;
  }
}
