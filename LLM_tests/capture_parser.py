import re
import sys
import json

def get_content_stream(txt):
    if res := re.search(r'\"content\":\"(.*?)\",\"done_reason', txt):
        response = res.group(1)
    else:
        response = ''
    return response

if __name__ == "__main__":
    dir = './debug_capture/'
    mode = sys.argv[1]
    file = dir + sys.argv[2]

    match mode:
        case 'stream':
            with open(file) as f:
                stream = f.readlines()

            stream = [get_content_stream(s) for s in stream]
            stream = ''.join(stream)

            [print(s) for s in stream.split(r'\n')]

        case 'json':
            with open(file) as f:
                j = json.load(f)['Prompt']

            [print(s) for s in j.split('\n')]
