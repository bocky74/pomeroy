use serde::{Deserialize, Serialize};

/// One completed focus session. Monthly JSON files store a list of these.
/// Field names are serialized in camelCase to match the JSON spec.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    /// ISO-8601 timestamp (with local offset) when the session started.
    pub start: String,
    /// ISO-8601 timestamp (with local offset) when the session ended.
    pub end: String,
    #[serde(rename = "durationMinutes")]
    pub duration_minutes: u32,
    pub project: String,
    pub tasks: Vec<String>,
    /// Optional free-text remark; empty string when not provided.
    #[serde(default)]
    pub remark: String,
}

/// A project the user can log sessions against, with its selectable tasks.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub name: String,
    #[serde(default)]
    pub tasks: Vec<String>,
}

/// Persistent application configuration, stored separately from the session logs.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    /// Folder chosen on first save where the monthly JSON files live.
    /// `None` until the user picks one.
    #[serde(rename = "dataFolder")]
    pub data_folder: Option<String>,
    #[serde(rename = "defaultDurationMinutes")]
    pub default_duration_minutes: u32,
    pub projects: Vec<Project>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            data_folder: None,
            default_duration_minutes: 25,
            projects: vec![Project {
                name: "Pomeroy".to_string(),
                tasks: vec![
                    "Design".to_string(),
                    "Build".to_string(),
                    "Docs".to_string(),
                ],
            }],
        }
    }
}
