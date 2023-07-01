const vscode = require("vscode");
const mysql = require("mysql2/promise");
const fs = require("fs");

// Global MySQL connection object
let connection;

// Command to connect to the MySQL server
const connectCommand = vscode.commands.registerCommand(
  "extension.connectToMySQL",
  async () => {
    // Prompt the user for MySQL server credentials
    // const server = await vscode.window.showInputBox({
    //   prompt: "MySQL local Server(Type Localhost or 127.0.0.1)",
    // });
    const user = await vscode.window.showInputBox({
      prompt: "Enter MySQL User Name",
    });
    const password = await vscode.window.showInputBox({
      prompt: "Enter MySQL User's Password",
      password: true,
    });

    // Create a MySQL connection pool
    connection = await mysql.createConnection({
      host: "localhost",
      user: user,
      password: password,
    });

    // Attempt to connect to the MySQL server
    try {
      await connection.connect();
      vscode.window.showInformationMessage("Connected to MySQL server!");
      openMySQLWebview();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to connect to MySQL server: ${error.message}`
      );
    }
  }
);

// Command to disconnect from the MySQL server
const disconnectCommand = vscode.commands.registerCommand(
  "extension.disconnectFromMySQL",
  async () => {
    if (connection) {
      // Close the MySQL connection pool
      await connection.end();
      vscode.window.showInformationMessage("Disconnected from MySQL server!");
    }
  }
);

// Function to open MySQL Webview
function openMySQLWebview() {
  const panel = vscode.window.createWebviewPanel(
    "mysqlWebview",
    "MySQL",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    }
  );

  panel.webview.html = getWebviewContent();

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "executeQuery") {
      const queries = message.query
        .split(";")
        .map((query) => query.trim())
        .filter((query) => query.length > 0);

      for (const query of queries) {
        try {
          const result = await executeQuery(query);
          panel.webview.postMessage({ command: "queryResult", result });
        } catch (error) {
          panel.webview.postMessage({
            command: "queryError",
            error: error.message,
          });
        }
      }
    }

    if (message.command === "showConfirmationDialog") {
      const confirmation = await vscode.window.showInformationMessage(
        "Current Line where the pointer is placed will be executed.Due You want to Execute current line?",
        "Yes"
      );
      if (confirmation === "Yes") {
        // Post the message to execute the query
        panel.webview.postMessage({
          command: "executeQuery",
          query: message.query,
        });
      } else {
        return;
      }

      try {
        const result = await executeQuery(message.query);
        panel.webview.postMessage({ command: "queryResult", result });
      } catch (error) {
        panel.webview.postMessage({
          command: "queryError",
          error: error.message,
        });
      }
    }

    if (message.command === "saveFile") {
      saveFile(message.query);
    }
  });

  // Function to save the content of the textarea to a file
  function saveFile(query) {
    const saveDialogOptions = {
      saveLabel: "Save",
      filters: {
        SQL: ["sql"],
        "All Files": ["*"],
      },
    };
    vscode.window.showSaveDialog(saveDialogOptions).then((uri) => {
      if (uri) {
        fs.writeFileSync(uri.fsPath, query);
        vscode.window.showInformationMessage("File saved successfully.");
      }
    });
  }
}

// Function to execute MySQL query
async function executeQuery(query) {
  try {
    const [rows] = await connection.query(query);
    return { query, rows };
  } catch (error) {
    throw new Error(`Failed to execute query: ${query}\n${error.message}`);
  }
}

function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
              body {
                  font-family: Arial, sans-serif;
                  padding: 5px;
                  display: flex;
                  flex-direction: column;
                  height: 95vh;
              }
              h1 {
                  margin-top: 10px;
              }
              .container {
                  display: flex;
                  flex-grow: 1;
              }
              .textarea-container {
                  flex-basis: 50%;
                  position: relative;
              }
              .line-numbers {
                  counter-reset: line;
                  position: absolute;
                  top: 0;
                  left: 0;
                  bottom: 0;
                  width: 30px;
                  border-right: 1px solid #ccc;
                  padding-right: 5px;
                  background-color: black;
                  overflow-y: scroll;
                  text-align: right;
                  height: calc(100% - 80px);
                  margin-top: 10px;
                  padding-top: 2px;
              }
              .line-numbers span {
                  counter-increment: line;
                  display: block;
                  line-height: 15px;
              }
              textarea {
                  width: calc(100% - 30px);
                  height: calc(100% - 80px);
                  resize: none;
                  padding-left: 40px; /* Adjust the padding value to leave space for line numbers */
                  padding-right: 0px;
                  border: none;
                  box-sizing: border-box;
                  overflow-y: scroll;
                  margin-top: 10px;
                  background-color: #f2f5f3;
              }
              .output-container {
                  flex-basis: 50%;
                  padding-left: 0px;
                  background-color: black;
                  overflow-y: scroll;
                  height: calc(100% - 80px);
                  margin-top: 10px;
              }
              .output-container h2 {
                  margin-top: 10px;
                  margin-bottom: 2px;
              }
              .output-container table {
                  width: 100%;
                  border-collapse: collapse;
              }
              .output-container th,
              .output-container td {
                  border: 1px solid #ccc;
                  padding: 5px;
                  text-align: left;
              }
              button {
                  margin-top: 10px;
                  padding: 5px 10px;
                  background-color: #ADD8E6;
              }
              #result {
                  height: 500px; /* Adjust the height as per your preference */
                  overflow-y: scroll;
                  padding: 10px;
              }
              .buttons-container {
                display: flex;
                justify-content: flex-end;
                margin-top: 10px;
                margin-right: 10px;
              }
          
              .buttons-container button {
                margin-left: 6px;
                font-size: 14px;
                border: none;
                background-color: #007acc;
                color: #fff;
                cursor: pointer;
                transition: background-color 0.3s ease;
              }

              .buttons-container button:hover {
                background-color: #005a8b ;
              }
        </style>
    </head>
    <body>
        <h1>Local MySQL WorkBench </h1>
        <div class="buttons-container">
        <button onclick="executeQuery()">Execute</button>
        <button onclick="executeAllQueries()">Execute All</button>
        <button id="clearButton">Clear Output</button>
        <button id="saveButton">Save As File</button>
      </div>
        <div class="container">
            <div class="textarea-container">
                <div class="line-numbers"></div>
                <textarea id="query" placeholder="Enter your MySQL query here..." rows="10"></textarea>
            </div>
            <div class="output-container">
                <div id="result"><h2> Output: </h2></div>
            </div>
        </div>
       

        <script>
 
        const vscode = acquireVsCodeApi();

        function updateLineNumbers() {
            const textarea = document.getElementById('query');
            const lineNumbersContainer = document.querySelector('.line-numbers');
            const lines = textarea.value.split('\\n');

            lineNumbersContainer.innerHTML = '';
            for (let i = 1; i <= lines.length; i++) {
                const lineNumber = document.createElement('span');
                lineNumber.textContent = i;
                lineNumbersContainer.appendChild(lineNumber);
            }
        }

        function executeQuery() {
          const textarea = document.getElementById('query');
          const query = textarea.value;
          const cursorPosition = textarea.selectionStart;
        
          // Find the start and end indices of the current line
          let lineStartIndex = cursorPosition - 1;
          let lineEndIndex = cursorPosition;
          while (lineStartIndex >= 0 && query[lineStartIndex] !== '\\n') {
            lineStartIndex--;
          }
          while (lineEndIndex < query.length && query[lineEndIndex] !== '\\n') {
            lineEndIndex++;
          }
          lineStartIndex++; // Adjust for the '\\n' character
        
          const currentLine = query.substring(lineStartIndex, lineEndIndex).trim();
        
          if (currentLine.length > 0) {
            // Post a message to the extension to show a confirmation dialog
            vscode.postMessage({ command: 'showConfirmationDialog', query: currentLine });
          } else {
            displayWarning('No query is selected on the current line.');
          }
        }
        
        
      

        function executeAllQueries() {
            const query = document.getElementById('query').value;

            if (query.trim().length > 0) {
                const queries = query.split(';').map(q => q.trim()).filter(q => q.length > 0);
                for (const q of queries) {
                    vscode.postMessage({ command: 'executeQuery', query: q });
                }
            }
        }

        function displayResult(result) {
            const resultDiv = document.getElementById('result');

            // Create a div element for each query result
           
            const queryResultDiv = document.createElement('div');

            // Create a heading for the query
            const queryHeading = document.createElement('h2');
            queryHeading.textContent = 'Executed Query - ' + result.query + ': ';

            // Check if the result has rows (for select queries)
            if (result.rows && result.rows.length > 0) {
                // Create the table element
                const table = document.createElement('table');

                // Create the table header
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                for (const field of Object.keys(result.rows[0])) {
                    const th = document.createElement('th');
                    th.textContent = field;
                    headerRow.appendChild(th);
                }
                thead.appendChild(headerRow);
                table.appendChild(thead);

                // Create the table body
                const tbody = document.createElement('tbody');
                for (const row of result.rows) {
                    const dataRow = document.createElement('tr');
                    for (const field of Object.keys(row)) {
                        const td = document.createElement('td');
                        td.textContent = row[field];
                        dataRow.appendChild(td);
                    }
                    tbody.appendChild(dataRow);
                }
                table.appendChild(tbody);

                // Append the table to the query result div
                queryResultDiv.appendChild(table);
            } else {
                // Display the result as executed if there are no rows (for non-select queries)
                const executedMessage = document.createElement('p');
                executedMessage.textContent = 'Executed';
                queryResultDiv.appendChild(executedMessage);
            }

            // Append the query heading and query result div to the overall result div
            resultDiv.appendChild(queryHeading);
            resultDiv.appendChild(queryResultDiv);

            // Scroll to the latest output
            resultDiv.scrollTop = resultDiv.scrollHeight;
        }

        // Function to display error
        function displayError(error) {
            const resultDiv = document.getElementById('result');

            // Create an error message div
            const errorDiv = document.createElement('div');
            errorDiv.textContent = 'Error: ' + error;

            // Append the error message div to the result div
            resultDiv.appendChild(errorDiv);

            // Scroll to the latest output
            resultDiv.scrollTop = resultDiv.scrollHeight;
        }

        // Function to display warning
        function displayWarning(message) {
            const resultDiv = document.getElementById('result');

            // Create a warning message div
            const warningDiv = document.createElement('div');
            warningDiv.textContent = 'Warning: ' + message;

            // Append the warning message div to the result div
            resultDiv.appendChild(warningDiv);

            // Scroll to the latest output
            resultDiv.scrollTop = resultDiv.scrollHeight;
        }

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'queryResult') {
                displayResult(message.result);
            } else if (message.command === 'queryError') {
                displayError(message.error);
            }
            if (message.command === 'saveFile') {
              saveFile();
            }
        });

        // Update line numbers when the textarea content changes
        const textarea = document.getElementById('query');
        textarea.addEventListener('input', updateLineNumbers);

        // Initialize line numbers
        updateLineNumbers();





        // clears the output 
        function clearOutput() {
          
      }
      
      // Add event listener to the clear button
      const clearButton = document.getElementById('clearButton');
      // clearButton.textContent = 'Clear Output';
      clearButton.addEventListener('click', ()=>{
        const resultDiv = document.getElementById('result');
          resultDiv.innerHTML = '<h4> Output: </h4>'; // Clear the content of the result div
      });
      
      // Append the clear button to the document body
      // document.body.appendChild(clearButton);




      const saveButton = document.getElementById('saveButton');
          saveButton.addEventListener('click', () => {
            const query = document.getElementById('query').value;
            vscode.postMessage({ command: 'saveFile', query });
          });



          // Function to handle the keydown event for saving the file
          function handleKeyDown(event) {
            // Check if the key combination is Ctrl+S
            if (event.ctrlKey && event.key === 's') {
              event.preventDefault(); // Prevent the default save behavior in the webview
              const query = document.getElementById('query').value;
              vscode.postMessage({ command: 'saveFile', query });
            }
          }

          // Add the keydown event listener to the document
          document.addEventListener('keydown', handleKeyDown);
      </script>
      
    </body>
    </html>
  `;
}

// Extension activation
function activate(context) {
  // Register the commands
  context.subscriptions.push(connectCommand);
  context.subscriptions.push(disconnectCommand);
}
exports.activate = activate;

// Extension deactivation
function deactivate() {
  if (connection) {
    // Close the MySQL connection pool on deactivation
    connection.end();
  }
}
exports.deactivate = deactivate;
