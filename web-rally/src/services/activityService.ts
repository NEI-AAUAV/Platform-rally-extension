import { Activity, ActivityCreate, ActivityUpdate, Checkpoint } from "@/types/activityTypes";

class ActivityService {
  private baseUrl = "/api/rally/v1";

  async getActivities(token: string): Promise<Activity[]> {
    const response = await fetch(`${this.baseUrl}/activities/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch activities");
    }
    const data = await response.json();
    return data.activities || [];
  }

  async getActivity(id: number, token: string): Promise<Activity> {
    const response = await fetch(`${this.baseUrl}/activities/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch activity");
    }
    return response.json();
  }

  async createActivity(activity: ActivityCreate, token: string): Promise<Activity> {
    const response = await fetch(`${this.baseUrl}/activities/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(activity),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to create activity");
    }
    
    return response.json();
  }

  async updateActivity(id: number, activity: ActivityUpdate, token: string): Promise<Activity> {
    const response = await fetch(`${this.baseUrl}/activities/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(activity),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to update activity");
    }
    
    return response.json();
  }

  async deleteActivity(id: number, token: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/activities/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to delete activity");
    }
  }

  async getCheckpoints(token: string): Promise<Checkpoint[]> {
    const response = await fetch(`${this.baseUrl}/checkpoint/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch checkpoints");
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }
}

export const activityService = new ActivityService();
