    // const socket = new WebSocket('ws://localhost:3000');
    const socket = new WebSocket('ws:https://websoket-signaling.onrender.com');
    let myName = '';
    let localStream, peer;
    let currentCall = null;

    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'error':
          alert(msg.message);
          break;

        case 'userList':
          updateUserList(msg.users);
          break;

        case 'incomingCall':
          showIncomingCall(msg.from);
          break;

        case 'signal':
          await handleSignal(msg);
          break;
      }
    };

    function registerUser() {
      myName = document.getElementById('myName').value.trim();
      if (!myName) return alert('Vui lòng nhập tên.');
      socket.send(JSON.stringify({ type: 'join', name: myName }));
    }

    function updateUserList(users) {
      const div = document.getElementById('userList');
      div.innerHTML = '<h3>Người dùng đang hoạt động:</h3>';
      users.forEach(user => {
        if (user.name !== myName) {
          const btn = user.status === 'available'
            ? `<button onclick="callUser('${user.name}')">📞 Gọi</button>`
            : `<span style="color:red">(Bận)</span>`;
          div.innerHTML += `<div class="user-item"><span>${user.name}</span> - ${btn}</div>`;
        }
      });
    }

    function callUser(target) {
      socket.send(JSON.stringify({ type: 'call', from: myName, target }));
      currentCall = target;
    }

    function showIncomingCall(fromUser) {
      const div = document.getElementById('incomingCall');
      div.innerHTML = `<b>${fromUser}</b> đang gọi cho bạn.<br>
        <button onclick="acceptCall('${fromUser}')">📹 Nghe</button>
        <button onclick="rejectCall('${fromUser}')">❌ Từ chối</button>`;
      div.style.display = 'block';
      currentCall = fromUser;
      document.getElementById('ringtone').play();
    }

    async function acceptCall(fromUser) {
      document.getElementById('incomingCall').style.display = 'none';
      document.getElementById('ringtone').pause();
      document.getElementById('ringtone').currentTime = 0;
      await startMedia();
      createPeer();
      sendSignal(fromUser, { type: 'accept' });
      document.getElementById('endCallBtn').style.display = 'inline-block';
    }

    function rejectCall(fromUser) {
      document.getElementById('incomingCall').style.display = 'none';
      document.getElementById('ringtone').pause();
      document.getElementById('ringtone').currentTime = 0;
      sendSignal(fromUser, { type: 'reject' });
    }

    function sendSignal(to, data) {
      socket.send(JSON.stringify({ type: 'signal', to, data }));
    }

    async function handleSignal(msg) {
      const { from, data } = msg;

      switch (data.type) {
        case 'accept':
          await startMedia();
          createPeer();
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          sendSignal(from, { type: 'offer', offer });
          document.getElementById('endCallBtn').style.display = 'inline-block';
          break;

        case 'reject':
          alert(`${from} đã từ chối cuộc gọi.`);
          currentCall = null;
          break;

        case 'offer':
          createPeer();
          await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal(from, { type: 'answer', answer });
          break;

        case 'answer':
          await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          break;

        case 'candidate':
          if (peer) {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
          break;

        case 'end':
          endCall(true);
          break;
      }
    }

    async function startMedia() {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('localVideo').srcObject = localStream;
    }

    function createPeer() {
      peer = new RTCPeerConnection(config);

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(currentCall, { type: 'candidate', candidate: event.candidate });
        }
      };

      peer.ontrack = (event) => {
        document.getElementById('remoteVideo').srcObject = event.streams[0];
      };

      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    function endCall(remote = false) {
      if (peer) {
        peer.close();
        peer = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
      }
      document.getElementById('localVideo').srcObject = null;
      document.getElementById('remoteVideo').srcObject = null;
      document.getElementById('endCallBtn').style.display = 'none';
      document.getElementById('ringtone').pause();
      document.getElementById('ringtone').currentTime = 0;

      if (!remote && currentCall) {
        sendSignal(currentCall, { type: 'end' });
      }

      currentCall = null;
    }