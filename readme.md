# README

## Description

This is going to act as an open source frontend for Samsung SmartThings devices, to be a basic replacement for ActionTiles. Currently, this is in very early testing, but will be updated as more tooling and devlopment occurs.

## Setup

### Cloning the repository
- Open up a terminal window
- Run the following command to clone the git repository to your local environment
- `git clone git@github.com:J-Durham/Smartthings-Custom-UI.git`

### Dependency installation
- Navigate to the directory of the repository
    - `cd smartthings-custom-ui`
- run the following command to install the requirements
    - `pip3 install -r requirements.txt`

### Authentication handling
- Create an OAuth application using the samsung developer portal
    - `https://developer.smartthings.com/workspace`
- Make sure to save the following values
    - `Client ID`
    - `Client Secret`
    - `Redirect URI`
    - `Auth Code`
- Save those values in your environment variables so they can be referenced by the tool
- Use the following commands to save those values in the environment, replacing the values in the arrow brackets <> with the values saved from the portal
    - `echo "\nSmartthings auth values\n" >> ~/.bashrc` 
    - `echo "export SMARTTHINGS_CLIENT_ID=<Client ID>\n" >> ~/.bashrc`
    - `echo "export SMARTTHINGS_CLIENT_SECRET=<Client Secret>\n" >> ~/.bashrc`
    - `echo "export SMARTTHINGS_REDIRECT_URI=<Redirect URI>\n" >> ~/.bashrc`
    - `echo "export SMARTTHINGS_AUTH_CODE=<Auth Code>\n" >> ~/.bashrc`
    - `~/.bashrc`
 
 ## Running the tool
 - Use the following command to run the tool
    - `python3 test_indexer.py`
