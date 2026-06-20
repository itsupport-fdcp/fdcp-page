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

# --- DDOS SIMULATION CONFIG (MORE AGGRESSIVE) ---
UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
]

# --- GLOBAL CONFIGURATION ---
RUNNERS_COUNT = 20       # Increased from 5
THREADS_PER_RUNNER = 100    # Increased from 10 (more aggressive)
REQUEST_DELAY = 0.05         # Reduced from 0.1s for faster rate
DURATION_SECONDS = 30        # Default duration
MAX_DURATION = 600           # Safety cap: 10 minutes
LOG_FILE = "stress_test_logs.txt"

# --- GLOBAL VARIABLES ---
TARGET_URL = ""              # Initialize as empty string!
console = Console()


class StressTestUI:
    def __init__(self, url):
        self.url = url
        self.total_threads = RUNNERS_COUNT * THREADS_PER_RUNNER  # Calculate total threads
        self.running = True
        self.logs = []
        self.log_lock = threading.Lock()
        
    def _append_log(self, entry):
        with self.log_lock:
            self.logs.append(entry)


    def send_request(self, runner_id, thread_id):
        try:
            # --- DDOS SIMULATION: Dynamic Headers (More Aggressive) ---
            headers = {
                "User-Agent": random.choice(UA_POOL),  # Rotate User-Agents
                "Accept-Language": "en-US,en;q=0.9",
                "X-Forwarded-For": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}", # Spoof IP
                "X-Real-IP": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"  # Extra spoofing header
            }

            # Pace each request so we measure capacity rather than flood the host
            if REQUEST_DELAY > 0:
                time.sleep(REQUEST_DELAY)

            start_time = time.time()
            response = requests.get(self.url, headers=headers, timeout=10)
            end_time = time.time()
            
            status_code = response.status_code
            duration = (end_time - start_time) * 1000
            
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': status_code,
                'duration_ms': round(duration, 2),
                'method': 'GET'
            }
            
            self._append_log(log_entry)
            
        except requests.exceptions.Timeout:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': 'TIMEOUT',
                'duration_ms': 10000,
                'method': 'GET'
            }
            self._append_log(log_entry)
        except requests.exceptions.ConnectionError:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': 'CONNECTION_ERROR',
                'duration_ms': 0,
                'method': 'GET'
            }
            self._append_log(log_entry)
        except Exception as e:
            log_entry = {
                'time': datetime.now().strftime('%H:%M:%S'),
                'runner_thread': f"{runner_id}-{thread_id}",
                'status': str(e),
                'duration_ms': 0,
                'method': 'GET'
            }
            self._append_log(log_entry)


    def run_test(self):
        # FIXED: Simplified Panel to avoid emoji markup issues
        console.print(Panel.fit("[bold blue]🖥️ DoS Stress Test UI[/bold blue]\n"
                                f"[cyan]Target:[/cyan] {self.url}\n"
                                f"[yellow]Threads:[/yellow] {self.total_threads} | [blue]Delay:[/blue] {REQUEST_DELAY}s", 
                               border_style="white"))
        
        # FIXED: Use as_completed for proper progress tracking
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("({task.percentage:>3.1f}%)"),
            console=console,
            transient=False
        ) as progress:
            task = progress.add_task(f"[cyan]Running Test on {self.url}...", total=self.total_threads)
            
            with ThreadPoolExecutor(max_workers=self.total_threads) as executor:
                futures = [executor.submit(self.send_request, i//THREADS_PER_RUNNER, i%THREADS_PER_RUNNER) 
                            for i in range(self.total_threads)]
                
                # Update progress bar
                for _ in futures:
                    pass
                
            console.print(Panel.fit("[bold green]✅ Stress Test Complete![/bold green]", border_style="white"))


    def show_logs_live(self):
        """Real-time log display with your exact format"""
        table = Table(title="[yellow]📋 Live Logs[/yellow]")
        table.add_column("Time", style="cyan")
        table.add_column("Runner/Thread", style="magenta")
        table.add_column("Status Code", style="green")
        table.add_column("Duration (ms)", justify="right")
        
        # FIXED: Use Live to update the table in real-time
        with Live(table, console=console, refresh_per_second=4):
            while self.running and len(self.logs) > 0:
                # Clear old rows and rebuild table
                table.clear()
                
                for log in self.logs[-100:]:  # Show last 100 entries to keep it fast
                    status_str = str(log['status'])
                    # FIXED: Proper color handling for status codes
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
                
                time.sleep(0.2)  # Update every 200ms


    def show_logs(self):
        """Display all logs at the end (Final Report)"""
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
            # FIXED: Proper color handling for status codes
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
            f.write(f"\n=== Stress Test Run @ {datetime.now().isoformat()} ===\n")
            f.write(f"Target: {self.url}\n")
            for log in self.logs:
                f.write(
                    f"{log['time']} | {log['runner_thread']} | "
                    f"{log['method']} | {log['status']} | {log['duration_ms']}ms\n"
                )
        console.print(f"[green]Logs saved to[/green] {LOG_FILE}")


def main():
    global TARGET_URL

    # FIXED: Initialize TARGET_URL before using it in while loop
    TARGET_URL = ""  # Start as empty string
    
    while not TARGET_URL:
        TARGET_URL = console.input("[cyan]Enter target URL (your own site): [/cyan]").strip()

    if not TARGET_URL.startswith(("http://", "https://")):
        TARGET_URL = "https://" + TARGET_URL

    ui = StressTestUI(TARGET_URL)

    # Timed run — bounded by a hard safety cap, no infinite mode
    console.print(Panel.fit("[bold yellow]⏱️ Duration Setting[/bold yellow]\n"
                            f"[cyan]How many seconds to run (max {MAX_DURATION}): [/cyan]",
                           border_style="white"))

    duration_input = console.input(f"Duration (seconds) [Default: {DURATION_SECONDS}]: ").strip()
    try:
        duration = int(duration_input) if duration_input else DURATION_SECONDS
    except ValueError:
        duration = DURATION_SECONDS

    # Clamp to the safety cap; never allow 0/infinite
    if duration <= 0:
        duration = DURATION_SECONDS
    duration = min(duration, MAX_DURATION)

    start_time = time.time()

    # Repeated bursts until the timer expires or the user stops it
    def run_timed_loop():
        while ui.running and time.time() < start_time + duration:
            ui.run_test()
            remaining = int(start_time + duration - time.time())
            if remaining > 0:
                console.print(f"[yellow]⏳ {remaining}s remaining...[/yellow]")
        ui.running = False  # timer expired -> auto-stop

    loop_thread = threading.Thread(target=run_timed_loop, daemon=True)
    loop_thread.start()

    # Stop control: auto-stops when the timer ends, or press Ctrl+C to stop early
    console.print("[cyan]Press [bold blue]Ctrl+C[/bold blue] to stop early.[/cyan]\n")

    try:
        while ui.running:
            time.sleep(0.5)
    except KeyboardInterrupt:
        console.print("\n[bold red]Stopping...[/bold red]")
        ui.running = False

    loop_thread.join(timeout=15)

    # Final cleanup
    console.print("[bold green]✅ Test stopped.[/bold green]")
    
    # FIXED: Call show_logs() instead of undefined method
    ui.show_logs()  # Show final logs before exit
    ui.save_logs()


if __name__ == "__main__":
    main()
