export const MYSQL_SCHEMA_SQL = `-- YENDRA AI OFFICE · MySQL 8.0 Persistent Task & Telemetry Schema
CREATE TABLE ai_employees (
  id VARCHAR(36) PRIMARY KEY,
  slug ENUM('manager','researcher','scriptwriter','video_editor','designer','publisher') UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  role VARCHAR(160) NOT NULL,
  department VARCHAR(120) NOT NULL,
  workstation VARCHAR(120) NOT NULL,
  current_status ENUM('Working','Thinking','Idle','Completed','Error') NOT NULL DEFAULT 'Idle',
  current_activity VARCHAR(255) NULL,
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  tasks_completed INT UNSIGNED NOT NULL DEFAULT 0,
  tasks_failed INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE office_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_uuid CHAR(36) UNIQUE NOT NULL,
  assignee_slug VARCHAR(48) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  priority ENUM('Low','Normal','High','Urgent') NOT NULL DEFAULT 'Normal',
  status ENUM('Queued','Working','Thinking','Completed','Error') NOT NULL DEFAULT 'Queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  output_summary TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tasks_assignee_status (assignee_slug, status)
);

CREATE TABLE video_production_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic VARCHAR(255) NOT NULL,
  format ENUM('16:9 YouTube','9:16 Shorts','LinkedIn Cut') NOT NULL DEFAULT '16:9 YouTube',
  status ENUM('In Progress','Awaiting Review','Approved','Revision Requested') NOT NULL DEFAULT 'In Progress',
  current_stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
  stages_json JSON NOT NULL,
  review_notes TEXT NULL,
  approved_by VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL
);

CREATE TABLE activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agent_slug VARCHAR(48) NOT NULL,
  task_id BIGINT UNSIGNED NULL,
  status ENUM('Working','Thinking','Idle','Completed','Error') NOT NULL,
  message VARCHAR(500) NOT NULL,
  source ENUM('manual','webhook-event','gemini-api','agent-worker') NOT NULL DEFAULT 'agent-worker',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES office_tasks(id) ON DELETE SET NULL
);`;

export const LARAVEL_REVERB_EVENT_PHP = `<?php

namespace App\\Events;

use Illuminate\\Broadcasting\\Channel;
use Illuminate\\Broadcasting\\InteractsWithSockets;
use Illuminate\\Contracts\\Broadcasting\\ShouldBroadcastNow;
use Illuminate\\Foundation\\Events\\Dispatchable;
use Illuminate\\Queue\\SerializesModels;

class AgentTaskUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $agentId,
        public string $status,
        public string $activity,
        public int $progress,
        public ?string $taskTitle = null,
        public ?string $errorMessage = null,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('yendra-office'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'App\\\\Events\\\\AgentTaskUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'agentId' => $this->agentId,
            'status' => $this->status,
            'activity' => $this->activity,
            'progress' => $this->progress,
            'taskTitle' => $this->taskTitle,
            'errorMessage' => $this->errorMessage,
            'timestamp' => now()->getTimestampMs(),
        ];
    }
}`;

export const LARAVEL_CONTROLLER_PHP = `<?php

namespace App\\Http\\Controllers\\Api;

use App\\Events\\AgentTaskUpdated;
use App\\Http\\Controllers\\Controller;
use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\DB;

class OfficeTaskController extends Controller
{
    public function updateAgentActivity(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'agentId' => 'required|in:manager,researcher,scriptwriter,video_editor,designer,publisher',
            'status' => 'required|in:Working,Thinking,Idle,Completed,Error',
            'activity' => 'required|string|max:255',
            'progress' => 'required|integer|min:0|max:100',
            'taskTitle' => 'nullable|string|max:200',
            'errorMessage' => 'nullable|string|max:500',
        ]);

        DB::table('ai_employees')
            ->where('slug', $validated['agentId'])
            ->update([
                'current_status' => $validated['status'],
                'current_activity' => $validated['activity'],
                'progress' => $validated['progress'],
                'updated_at' => now(),
            ]);

        AgentTaskUpdated::dispatch(
            $validated['agentId'],
            $validated['status'],
            $validated['activity'],
            $validated['progress'],
            $validated['taskTitle'] ?? null,
            $validated['errorMessage'] ?? null,
        );

        return response()->json(['dispatched' => true]);
    }
}`;
