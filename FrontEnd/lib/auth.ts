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

    if (!response.ok) {
      console.error("Login failed:", response.statusText);
      return null;
    }

    const data = await response.json();
    // Assuming the login endpoint returns user data directly if successful
    // You might need to adjust this based on the actual response structure
    return { id: data.id, email: data.email, name: data.first_name + " " + data.last_name, phone: data.phone };
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
    // Assuming the signup endpoint returns user data directly if successful
    // You might need to adjust this based on the actual response structure
    return { id: data.id, email: data.email, name: data.first_name + " " + data.last_name, phone: data.phone };
  } catch (error) {
    console.error("Registration error:", error);
    return null;
  }
}
