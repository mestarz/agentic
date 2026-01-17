import time

def generate_stream(messages, config):
    last_msg = messages[-1]['content'] if messages else "nothing"
    response = f"This is a response from the Python Adapter! You said: '{last_msg}'."
    
    words = response.split(" ")
    for word in words:
        yield word + " "
        time.sleep(0.1)