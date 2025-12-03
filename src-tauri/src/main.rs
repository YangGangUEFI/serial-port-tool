#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{State};
use tokio::net::TcpListener;
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;

// --- State Definitions ---

struct AppState {
    // 广播通道的发送端。当有数据需要发送给 TCP 客户端时，写入这里。
    // Option 用于表示服务器是否开启。
    tx: Mutex<Option<broadcast::Sender<Vec<u8>>>>,
    // 用于通知监听任务停止的信号
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

// --- Commands ---

#[tauri::command]
async fn start_tcp_server(port: u16, state: State<'_, AppState>) -> Result<String, String> {
    let mut tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
    let mut shutdown_guard = state.shutdown_tx.lock().map_err(|e| e.to_string())?;

    // 如果已经在运行，先关闭
    if tx_guard.is_some() {
        return Err("Server already running".into());
    }

    // 创建广播通道 (容量 100 条消息)
    let (tx, _) = broadcast::channel(100);
    *tx_guard = Some(tx.clone());

    // 创建关闭信号
    let (shutdown_send, mut shutdown_recv) = tokio::sync::oneshot::channel();
    *shutdown_guard = Some(shutdown_send);

    // 启动监听线程
    let tx_for_thread = tx.clone();
    
    tokio::spawn(async move {
        let addr = format!("0.0.0.0:{}", port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                println!("Failed to bind TCP: {}", e);
                return;
            }
        };

        println!("TCP Server listening on {}", addr);

        loop {
            tokio::select! {
                // 接受新连接
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((mut socket, addr)) => {
                            println!("New client connected: {}", addr);
                            let mut rx = tx_for_thread.subscribe();
                            
                            // 为每个客户端启动一个写入线程
                            tokio::spawn(async move {
                                loop {
                                    match rx.recv().await {
                                        Ok(data) => {
                                            if let Err(e) = socket.write_all(&data).await {
                                                println!("Client disconnected (write error): {}", e);
                                                break;
                                            }
                                        }
                                        Err(_) => break, // 通道关闭或滞后
                                    }
                                }
                            });
                        }
                        Err(e) => println!("Accept error: {}", e),
                    }
                }
                // 接收关闭信号
                _ = &mut shutdown_recv => {
                    println!("TCP Server stopping...");
                    break;
                }
            }
        }
    });

    Ok(format!("Server started on port {}", port))
}

#[tauri::command]
fn stop_tcp_server(state: State<AppState>) -> Result<(), String> {
    let mut tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
    let mut shutdown_guard = state.shutdown_tx.lock().map_err(|e| e.to_string())?;

    // Drop sender to close channel (stop client loops)
    *tx_guard = None;

    // Send shutdown signal to listener loop
    if let Some(shutdown_tx) = shutdown_guard.take() {
        let _ = shutdown_tx.send(());
    }

    Ok(())
}

#[tauri::command]
fn broadcast_data(data: Vec<u8>, state: State<AppState>) -> Result<(), String> {
    let tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
    
    if let Some(tx) = &*tx_guard {
        // 不需要等待接收者，直接发送
        let _ = tx.send(data); 
    }
    // 如果服务器没开，就忽略数据
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            tx: Mutex::new(None),
            shutdown_tx: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_tcp_server,
            stop_tcp_server,
            broadcast_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
