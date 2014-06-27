function WFSClient(fshost,fsname,folder) {
	
	this.readTextFile=function(path,callback) {_readTextFile(path,callback);};
	this.writeTextFile=function(path,text,callback) {_writeTextFile(path,text,callback);};
	
	if (!fshost) fshost=get_default_host();
	
	function _readTextFile(path,callback) {
		get_file_checksum(path,function(tmp1) {
			if (!tmp1.success) {
				callback(tmp1);
				return;
			}
			get_text_file(tmp1.checksum,callback);
		});
	}
	
	function get_file_checksum(path,callback) {
		var url='http://'+fshost+'/wisdmfileserver/getFileChecksum?fsname='+fsname+'&path='+append_paths(folder,path);
		url+='&rand='+Math.random();
		console.log('get_text_checksum: '+url);
		$.get(url,function(txt) {
			callback({success:true,checksum:txt});
		});
	}
	function get_text_file(checksum,callback) {
		var url='http://'+fshost+'/wisdmfileserver/getFileData?checksum='+checksum;
		url+='&rand='+Math.random();
		console.log('get_text_file: '+url);
		$.get(url,function(txt) {
			callback({success:true,text:txt});
		});
	}
	
	function _writeTextFile(path,text,callback) {
		set_file_text(path,text,function(tmp1) {
			if (!tmp1.success) {
				callback(tmp1);
				return;
			}
			callback({success:true});
		});
	}
	function set_file_text(path,text,callback) {
		var url='http://'+fshost+'/wisdmfileserver/setFileData?fsname='+fsname+'&path='+append_paths(folder,path);
		$.post(url,text,function(tmp1) {
			callback({success:true});
		});
	}
	function get_default_host() {
		if (location.hostname=='localhost') return 'localhost:8006';
		else return 'realhub.org:8006';
	}
	function append_paths(path1,path2) {
		if (!path1) return path2;
		if (!path2) return path1;
		return path1+'/'+path2;
	}
}
